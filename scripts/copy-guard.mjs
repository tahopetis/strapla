#!/usr/bin/env node
/**
 * Copy guard CLI (W8a). The scan and its rules live in `src/lib/copy-guard.ts`;
 * this file only parses options, prints `file:line` results and sets the exit code.
 *
 * Usage: node scripts/copy-guard.mjs [--root <dir>] [--allowlist <file>]
 *
 * Exit codes: 0 clean, 1 violations, 2 setup/configuration error.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CopyGuardError, runCopyGuard } from '../src/lib/copy-guard.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const USAGE = `Copy guard (W8a)

Usage: node scripts/copy-guard.mjs [--root <dir>] [--allowlist <file>]

  --root       repository root to scan (default: this checkout)
  --allowlist  allowlist file (default: scripts/copy-guard-allowlist.json)

Exit codes: 0 clean, 1 violations, 2 setup/configuration error.`;

function fail(message) {
  console.error(`copy-guard: ${message}`);
  process.exit(2);
}

const options = { root: null, allowlist: null };
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--help' || arg === '-h') {
    console.log(USAGE);
    process.exit(0);
  }
  if (arg !== '--root' && arg !== '--allowlist') fail(`unknown option ${arg}`);
  const value = args[index + 1];
  if (!value || value.startsWith('--')) fail(`${arg} needs a value`);
  options[arg.slice(2)] = value;
  index += 1;
}

const root = resolve(options.root ?? join(SCRIPT_DIR, '..'));
const allowlistPath = resolve(
  options.allowlist ?? join(SCRIPT_DIR, 'copy-guard-allowlist.json'),
);

try {
  const result = runCopyGuard({ root, allowlistPath });

  for (const violation of result.violations) {
    console.log(`${violation.file}:${violation.line}: ${violation.message}`);
  }
  for (const entry of result.stale) {
    console.error(`copy-guard: warning: stale allowlist entry — ${entry}`);
  }

  if (result.violations.length > 0) {
    console.error(
      `copy-guard: ${result.violations.length} violation(s) in ${result.files.length} files. Keep user-visible copy free of milestone IDs, hard-coded fiscal years and unlisted ADR/BR references.`,
    );
    process.exit(1);
  }

  console.log(
    `copy-guard: ${result.files.length} files scanned, 0 violations (${result.allowedEntries} allowlist entries covering ${result.allowedOccurrences} ADR/BR occurrences).`,
  );
} catch (error) {
  if (error instanceof CopyGuardError) fail(error.message);
  throw error;
}
