import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CopyGuardError, runCopyGuard } from './copy-guard';

/**
 * Tests for the copy guard (W8a): the rule set, the allowlist count semantics and
 * `file:line` reporting. The scan runs against emitted fixtures, and one smoke
 * test proves the CLI contract (`node scripts/copy-guard.mjs`).
 */

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(REPO_ROOT, 'scripts', 'copy-guard.mjs');

async function createRoot(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'strapla-copy-guard-'));
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

async function writeAllowlist(
  root: string,
  references: Array<{ file: string; token: string; count: number }>,
): Promise<string> {
  const path = join(root, 'allowlist.json');
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      reason: 'Fixture allowlist for the copy-guard tests.',
      references,
    }),
    'utf8',
  );
  return path;
}

let badRoot: string;
let cleanRoot: string;
let allowedRoot: string;
let overCountRoot: string;
let underCountRoot: string;
let allowedListPath: string;
let overCountListPath: string;
let underCountListPath: string;

beforeAll(async () => {
  badRoot = await createRoot({
    'src/app/page.tsx': [
      'export default function Page() {',
      '  return (',
      '    <div>',
      '      <p>',
      '        Milestone M2 is ready for FY2027.',
      '      </p>',
      '      <p className="M3-ready">The 2027 annual plan uses ADR-0005 and BR-99.</p>',
      '      <p>The annual plan for 2026 is also hard-coded.</p>',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n'),
  });

  cleanRoot = await createRoot({
    'src/app/page.tsx': [
      "import { helper } from './M1-helpers';",
      '',
      '// M3, FY2027 and ADR-9999 in a comment are not copy.',
      "const labels = { 'M2': 'a property key is not copy' };",
      'export default function Page() {',
      '  return (',
      '    <div className="M2-grid" href="/M4" value="M5" onClick={() => \'FY2027\'}>',
      '      <p>The plan is loaded.</p>',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n'),
  });

  allowedRoot = await createRoot({
    'src/app/page.tsx': [
      'export default function Page() {',
      '  return <p>See ADR-0005.</p>;',
      '}',
      '',
    ].join('\n'),
  });
  allowedListPath = await writeAllowlist(allowedRoot, [
    { file: 'src/app/page.tsx', token: 'ADR-0005', count: 1 },
  ]);

  overCountRoot = await createRoot({
    'src/app/page.tsx': [
      'export default function Page() {',
      '  return <p>See ADR-0005 and ADR-0005.</p>;',
      '}',
      '',
    ].join('\n'),
  });
  overCountListPath = await writeAllowlist(overCountRoot, [
    { file: 'src/app/page.tsx', token: 'ADR-0005', count: 1 },
  ]);

  underCountRoot = await createRoot({
    'src/app/page.tsx': [
      'export default function Page() {',
      '  return <p>See BR-11.</p>;',
      '}',
      '',
    ].join('\n'),
  });
  underCountListPath = await writeAllowlist(underCountRoot, [
    { file: 'src/app/page.tsx', token: 'BR-11', count: 2 },
  ]);
});

afterAll(async () => {
  for (const root of [badRoot, cleanRoot, allowedRoot, overCountRoot, underCountRoot]) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('copy guard rules', () => {
  it('passes on the current repository copy with the committed allowlist', () => {
    const result = runCopyGuard({
      root: REPO_ROOT,
      allowlistPath: join(REPO_ROOT, 'scripts', 'copy-guard-allowlist.json'),
    });
    expect(result.violations).toEqual([]);
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.allowedOccurrences).toBe(44);
  });

  it('reports planted violations with their file and line', () => {
    const result = runCopyGuard({
      root: badRoot,
      allowlistPath: join(REPO_ROOT, 'scripts', 'copy-guard-allowlist.json'),
    });
    const rendered = result.violations.map(
      (violation) => `${violation.file}:${violation.line}: ${violation.message}`,
    );
    expect(rendered).toContain('src/app/page.tsx:5: milestone identifier "M2"');
    expect(rendered).toContain('src/app/page.tsx:5: hard-coded fiscal year "FY2027"');
    expect(rendered).toContain('src/app/page.tsx:7: hard-coded fiscal year "2027"');
    expect(rendered).toContain('src/app/page.tsx:7: ADR/BR reference "ADR-0005" is not on the copy allowlist (allowed 0 in this file, found 1)');
    expect(rendered).toContain('src/app/page.tsx:7: ADR/BR reference "BR-99" is not on the copy allowlist (allowed 0 in this file, found 1)');
    expect(rendered).toContain('src/app/page.tsx:8: hard-coded fiscal year "2026"');
    expect(rendered).not.toContain('milestone identifier "M3"');
  });

  it('ignores comments, import paths, property keys, technical attributes and handlers', () => {
    const result = runCopyGuard({
      root: cleanRoot,
      allowlistPath: join(REPO_ROOT, 'scripts', 'copy-guard-allowlist.json'),
    });
    expect(result.violations).toEqual([]);
  });

  it('passes references covered by the allowlist', () => {
    const result = runCopyGuard({ root: allowedRoot, allowlistPath: allowedListPath });
    expect(result.violations).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it('fails an extra occurrence beyond the allowlisted count', () => {
    const result = runCopyGuard({ root: overCountRoot, allowlistPath: overCountListPath });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      file: 'src/app/page.tsx',
      line: 2,
      message:
        'ADR/BR reference "ADR-0005" is not on the copy allowlist (allowed 1 in this file, found 2)',
    });
  });

  it('warns (without failing) when copy shrinks below the allowlist', () => {
    const result = runCopyGuard({ root: underCountRoot, allowlistPath: underCountListPath });
    expect(result.violations).toEqual([]);
    expect(result.stale).toEqual(['src/app/page.tsx :: BR-11 (allowlist 2, found 1)']);
  });

  it('fails closed on setup problems', async () => {
    expect(() =>
      runCopyGuard({ root: badRoot, allowlistPath: join(badRoot, 'missing.json') }),
    ).toThrow(CopyGuardError);

    const duplicate = await writeAllowlist(badRoot, [
      { file: 'src/app/page.tsx', token: 'ADR-0005', count: 1 },
      { file: 'src/app/page.tsx', token: 'ADR-0005', count: 1 },
    ]);
    expect(() => runCopyGuard({ root: badRoot, allowlistPath: duplicate })).toThrow(
      /duplicate allowlist reference/,
    );

    const emptyRoot = await createRoot({ 'src/app/notes.txt': 'not a page' });
    expect(() => runCopyGuard({ root: emptyRoot, allowlistPath: allowedListPath })).toThrow(
      /no .tsx files found/,
    );
    await rm(emptyRoot, { recursive: true, force: true });
  });
});

describe('copy guard CLI', () => {
  it('runs as a Node script on this checkout', async () => {
    const { stdout } = await execFileAsync(process.execPath, [SCRIPT], {
      cwd: REPO_ROOT,
      maxBuffer: 5 * 1024 * 1024,
    });
    expect(stdout).toContain('0 violations');
    expect(stdout).toContain('44 ADR/BR occurrences');
  });
});
