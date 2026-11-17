import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/opening-import.ts');
const FIXTURES = join(ROOT, 'fixtures/opening-import');

async function cli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, [SCRIPT, ...args], { cwd: ROOT });
}

describe('opening-import CLI', () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'strapla-opening-'));
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('validates a good file and prints per-line results', async () => {
    const { stdout } = await cli([
      'validate',
      'annual-programs',
      join(FIXTURES, 'annual-programs.sample.csv'),
    ]);
    expect(stdout).toContain('Opening-balance import dry run — Annual programs');
    expect(stdout).toContain('line 2: OK');
    expect(stdout).toContain('Result: VALID — 3 row(s) ready to import.');
  });

  it('exits non-zero on an invalid file and says nothing would be written', async () => {
    await expect(
      cli(['validate', 'projects', join(FIXTURES, 'projects.invalid.csv')]),
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('Result: INVALID — 4 error(s). Nothing would be written.'),
    });
  });

  it('generates a template from the field list and validates the filled file', async () => {
    const templatePath = join(directory, 'annual-programs.csv');
    const { stdout } = await cli([
      'template',
      'annual-programs',
      '--closing-fiscal-year',
      '2026',
      '--format',
      'csv',
      '--out',
      templatePath,
    ]);
    expect(stdout).toContain('Opening balance — FY2026 close / <reference>');

    const template = await readFile(templatePath, 'utf8');
    expect(template).toContain('Code,Name,Strategic initiative code');
    const filledPath = join(directory, 'annual-programs-filled.csv');
    await writeFile(
      filledPath,
      `${template}PRG-09,Service catalogue,SI-01,PRG-09-2026,1000000,2000000,,,,`,
      'utf8',
    );

    const validated = await cli(['validate', 'annual-programs', filledPath]);
    expect(validated.stdout).toContain('Result: VALID — 1 row(s) ready to import.');
  });

  it('ships the committed owner-added column in the projects template', async () => {
    const templatePath = join(directory, 'projects.csv');
    await cli([
      'template',
      'projects',
      '--closing-fiscal-year',
      '2026',
      '--format',
      'csv',
      '--out',
      templatePath,
    ]);

    const template = await readFile(templatePath, 'utf8');
    expect(template).toContain('Procurement method');
    const lines = template.split('\r\n');
    const header = lines.find((line) => line !== '' && !line.startsWith('#'));
    const exampleIndex = lines.findIndex((line) => line.startsWith('# Example row (')) + 1;
    const example = lines[exampleIndex]?.replace(/^# /, '');
    expect(header).toBeDefined();
    expect(example).toBeDefined();

    const filledPath = join(directory, 'projects-filled.csv');
    await writeFile(filledPath, `${header}\r\n${example}\r\n`, 'utf8');
    const validated = await cli(['validate', 'projects', filledPath]);
    expect(validated.stdout).toContain('line 2: OK');
    expect(validated.stdout).toContain('Result: VALID — 1 row(s) ready to import.');
  });

  it('rejects an unknown data set with a usage error', async () => {
    await expect(cli(['validate', 'not-a-data-set', 'x.csv'])).rejects.toMatchObject({
      code: 2,
      stderr: expect.stringContaining('Unknown data set "not-a-data-set".'),
    });
  });
});
