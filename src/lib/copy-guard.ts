import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/**
 * Copy guard (W8a) — keeps W0 permanent.
 *
 * Scans user-visible copy in app pages and components (`src/app/**\/*.tsx`,
 * `src/components/**\/*.tsx`) and reports:
 *
 *   - milestone identifiers `M1`–`M5` as standalone tokens,
 *   - hard-coded fiscal years (`FY2027`, `FY 2027`, `plan for 2027`, …),
 *   - ADR/BR references that are not on the committed allowlist.
 *
 * Copy means JSX text, string/template literals and JSX attributes that carry copy.
 * Comments, import/export paths, type literals, object property keys, switch-case
 * values and technical attributes (className, href, key, value, event handlers, …)
 * are deliberately skipped. The repository's TypeScript dev dependency parses the
 * files, so the guard adds no runtime dependency.
 *
 * This module is the testable core; `scripts/copy-guard.mjs` is the CLI.
 */

export class CopyGuardError extends Error {}

export interface CopyGuardViolation {
  file: string;
  line: number;
  message: string;
}

export interface CopyGuardResult {
  files: string[];
  violations: CopyGuardViolation[];
  /** Allowlist entries that permit more references than the copy now contains. */
  stale: string[];
  allowedEntries: number;
  allowedOccurrences: number;
}

export interface CopyGuardOptions {
  root: string;
  allowlistPath: string;
}

interface AllowlistEntry {
  file: string;
  token: string;
  count: number;
}

interface AllowlistDocument {
  version: number;
  reason: string;
  references: AllowlistEntry[];
}

interface CopyValue {
  value: string;
  lineAt: (offset: number) => number;
}

interface Reference {
  file: string;
  token: string;
  lines: number[];
}

/** JSX attributes that hold code, not copy. */
const NON_COPY_ATTRIBUTES = new Set([
  'accept',
  'action',
  'autoComplete',
  'class',
  'className',
  'colSpan',
  'defaultValue',
  'dir',
  'encType',
  'for',
  'form',
  'htmlFor',
  'href',
  'id',
  'inputMode',
  'key',
  'lang',
  'max',
  'maxLength',
  'method',
  'min',
  'name',
  'pattern',
  'ref',
  'rel',
  'role',
  'rowSpan',
  'scope',
  'src',
  'srcSet',
  'step',
  'style',
  'tabIndex',
  'target',
  'type',
  'value',
]);

const MILESTONE = /\bM[1-5]\b/g;
const FISCAL_YEAR_PREFIXED = /\bFY\s?\d{4}\b/g;
const FISCAL_YEAR_CONTEXT = [
  /\b(?:fiscal\s+year|year|plan|horizon)(?:\s+for)?\s+(?:19|20)\d{2}\b/gi,
  /\b(?:19|20)\d{2}\s+(?:annual\s+plan|fiscal\s+year|plan|horizon)\b/gi,
];
const REFERENCE = /\b(?:ADR-\d{4}|BR-\d+)\b/g;

function isNonCopyAttribute(name: string): boolean {
  if (NON_COPY_ATTRIBUTES.has(name)) return true;
  if (name.startsWith('on')) return true; // event handlers
  if (name.startsWith('data-')) return true;
  return name.startsWith('aria-') && name !== 'aria-label';
}

function isNonCopyLiteral(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isLiteralTypeNode(parent)) return true;
  if (ts.isCaseClause(parent) && parent.expression === node) return true;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isEnumMember(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  return false;
}

function collectTsx(directory: string, files: string[]): void {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new CopyGuardError(`cannot read ${directory}: ${(error as Error).message}`);
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectTsx(path, files);
    else if (entry.name.endsWith('.tsx')) files.push(path);
  }
}

/** Every user-visible copy value in one file, with a line resolver for matches. */
function copyValues(file: string): CopyValue[] {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new CopyGuardError(`cannot read ${file}: ${(error as Error).message}`);
  }

  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const values: CopyValue[] = [];

  function push(
    node: ts.Node,
    value: string,
    trackOffsets: boolean,
    lineIndex = source.getLineAndCharacterOfPosition(node.getStart(source)).line,
  ): void {
    const line = lineIndex + 1;
    values.push({
      value,
      lineAt: trackOffsets
        ? (offset) => line + (value.slice(0, offset).match(/\n/g) ?? []).length
        : () => line,
    });
  }

  function visit(node: ts.Node): void {
    // Imports/exports are paths, not copy; comments never become AST nodes.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isExternalModuleReference(node)) return;
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return;

    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(source);
      if (isNonCopyAttribute(name)) return;
      ts.forEachChild(node, visit);
      return;
    }

    if (ts.isStringLiteral(node)) {
      if (isNonCopyLiteral(node)) return;
      push(node, node.text, false);
      return;
    }
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      if (isNonCopyLiteral(node)) return;
      push(node, node.text, true);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      push(node.head, node.head.text, true);
      for (const span of node.templateSpans) push(span.literal, span.literal.text, true);
      return;
    }
    if (ts.isJsxText(node)) {
      // JSX text starts at the previous token's end; its value begins there too,
      // so count newlines inside the value from the full start.
      push(node, node.text, true, source.getLineAndCharacterOfPosition(node.getFullStart()).line);
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return values;
}

function readAllowlist(path: string): AllowlistDocument {
  let document: AllowlistDocument;
  try {
    document = JSON.parse(readFileSync(path, 'utf8')) as AllowlistDocument;
  } catch (error) {
    throw new CopyGuardError(`cannot read the allowlist at ${path}: ${(error as Error).message}`);
  }
  if (document?.version !== 1) {
    throw new CopyGuardError('allowlist version is not 1');
  }
  if (typeof document.reason !== 'string' || document.reason.trim() === '') {
    throw new CopyGuardError('allowlist needs a non-empty reason');
  }
  if (!Array.isArray(document.references)) {
    throw new CopyGuardError('allowlist.references is not an array');
  }

  const seen = new Set<string>();
  for (const entry of document.references) {
    if (
      typeof entry?.file !== 'string' ||
      typeof entry?.token !== 'string' ||
      entry.file === '' ||
      entry.token === '' ||
      !Number.isInteger(entry.count) ||
      entry.count < 1
    ) {
      throw new CopyGuardError('every allowlist reference needs file, token and a positive count');
    }
    const key = `${entry.file}::${entry.token}`;
    if (seen.has(key)) {
      throw new CopyGuardError(`duplicate allowlist reference ${entry.file} :: ${entry.token}`);
    }
    seen.add(key);
  }
  return document;
}

export function runCopyGuard({ root, allowlistPath }: CopyGuardOptions): CopyGuardResult {
  const files: string[] = [];
  collectTsx(join(root, 'src', 'app'), files);
  collectTsx(join(root, 'src', 'components'), files);
  files.sort();
  if (files.length === 0) {
    throw new CopyGuardError(
      `no .tsx files found under ${join(root, 'src', 'app')} or ${join(root, 'src', 'components')}`,
    );
  }

  const violations: CopyGuardViolation[] = [];
  const references = new Map<string, Reference>();

  for (const file of files) {
    const display = relative(root, file).split(sep).join('/');
    for (const { value, lineAt } of copyValues(file)) {
      for (const match of value.matchAll(MILESTONE)) {
        violations.push({
          file: display,
          line: lineAt(match.index ?? 0),
          message: `milestone identifier "${match[0]}"`,
        });
      }
      for (const match of value.matchAll(FISCAL_YEAR_PREFIXED)) {
        violations.push({
          file: display,
          line: lineAt(match.index ?? 0),
          message: `hard-coded fiscal year "${match[0].replace(/\s+/g, ' ')}"`,
        });
      }
      for (const pattern of FISCAL_YEAR_CONTEXT) {
        for (const match of value.matchAll(pattern)) {
          const year = match[0].match(/(?:19|20)\d{2}/)?.[0] ?? match[0];
          violations.push({
            file: display,
            line: lineAt(match.index ?? 0),
            message: `hard-coded fiscal year "${year}"`,
          });
        }
      }
      for (const match of value.matchAll(REFERENCE)) {
        const key = `${display}::${match[0]}`;
        const reference = references.get(key) ?? { file: display, token: match[0], lines: [] };
        reference.lines.push(lineAt(match.index ?? 0));
        references.set(key, reference);
      }
    }
  }

  const allowlist = readAllowlist(allowlistPath);
  const allowed = new Map<string, AllowlistEntry>();
  for (const entry of allowlist.references) {
    allowed.set(`${entry.file}::${entry.token}`, entry);
  }

  const stale: string[] = [];
  const seen = new Set<string>();
  for (const [key, reference] of references) {
    seen.add(key);
    const entry = allowed.get(key);
    const permitted = entry?.count ?? 0;
    if (reference.lines.length > permitted) {
      for (const line of reference.lines.slice(permitted)) {
        violations.push({
          file: reference.file,
          line,
          message: `ADR/BR reference "${reference.token}" is not on the copy allowlist (allowed ${permitted} in this file, found ${reference.lines.length})`,
        });
      }
    } else if (reference.lines.length < permitted) {
      stale.push(
        `${reference.file} :: ${reference.token} (allowlist ${permitted}, found ${reference.lines.length})`,
      );
    }
  }
  let allowedOccurrences = 0;
  for (const entry of allowlist.references) {
    allowedOccurrences += entry.count;
    if (!seen.has(`${entry.file}::${entry.token}`)) {
      stale.push(`${entry.file} :: ${entry.token} (allowlist ${entry.count}, found 0)`);
    }
  }

  violations.sort(
    (left, right) => left.file.localeCompare(right.file) || left.line - right.line,
  );

  return {
    files,
    violations,
    stale,
    allowedEntries: allowlist.references.length,
    allowedOccurrences,
  };
}
