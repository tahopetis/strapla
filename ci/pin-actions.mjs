#!/usr/bin/env node
/**
 * security-gate — pin-actions.mjs
 *
 * Rewrites every `uses: owner/repo@ref` in a workflow to the commit SHA that
 * ref resolves to right now. Tags are mutable: a compromised or retargeted tag
 * runs new code with your token. A SHA cannot move.
 *
 *   node ci/pin-actions.mjs .github/workflows/security.yml
 *   node ci/pin-actions.mjs .github/workflows/security.yml --check
 *   GITHUB_TOKEN=... node ci/pin-actions.mjs .github/workflows/*.yml
 *
 * `--check` changes nothing and exits 1 if any ref is still floating, so it can
 * run in CI as a lint.
 *
 * Unauthenticated GitHub API allows 60 requests per hour, which is enough for a
 * handful of actions. Set GITHUB_TOKEN or GH_TOKEN to raise the limit.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const targets = args.filter((a) => !a.startsWith("--"));

if (targets.length === 0) {
  console.error("usage: pin-actions.mjs <workflow.yml...> [--check]");
  process.exit(2);
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const headers = {
  accept: "application/vnd.github+json",
  "user-agent": "security-gate/pin-actions",
  ...(token ? { authorization: `Bearer ${token}` } : {}),
};

const calls = new Map();

const api = async (path) => {
  if (calls.has(path)) return calls.get(path);
  const promise = (async () => {
    const res = await fetch(`https://api.github.com${path}`, { headers });
    if (res.status === 404) return null;
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      throw new Error(
        `GitHub API refused the request (${res.status}, remaining=${remaining ?? "?"}). ` +
          "Set GITHUB_TOKEN to raise the rate limit.",
      );
    }
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
    return res.json();
  })();
  calls.set(path, promise);
  return promise;
};

/** A tag ref may point at a tag object; the commit is one level further down. */
const peel = async (ownerRepo, ref, depth = 0) => {
  if (!ref?.object) return null;
  if (ref.object.type === "commit") return ref.object.sha;
  if (ref.object.type === "tag" && depth < 3) {
    const tag = await api(`/repos/${ownerRepo}/git/tags/${ref.object.sha}`);
    return tag ? peel(ownerRepo, tag, depth + 1) : null;
  }
  return null;
};

const resolveRef = async (ownerRepo, ref) => {
  for (const kind of ["tags", "heads"]) {
    const found = await api(`/repos/${ownerRepo}/git/ref/${kind}/${ref}`);
    const sha = await peel(ownerRepo, found);
    if (sha) return sha;
  }
  const commit = await api(`/repos/${ownerRepo}/commits/${ref}`);
  return commit?.sha ?? null;
};

const isPinned = (ref) => /^[0-9a-f]{40}$/.test(ref) || /^[0-9a-f]{64}$/.test(ref);

const LINE = /^(\s*(?:-\s*)?uses:\s*)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s#]+)(\s*(?:#.*)?)$/;

let exitCode = 0;
let changed = 0;
let floating = 0;

for (const target of targets) {
  const path = resolve(target);
  if (!existsSync(path)) {
    console.error(`missing file: ${path}`);
    exitCode = 2;
    continue;
  }
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  let touched = false;

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(LINE);
    if (!match) continue;
    const [, prefix, ownerRepo, ref, suffix] = match;

    if (isPinned(ref)) continue;

    floating += 1;
    if (checkOnly) {
      console.log(`floating  ${ownerRepo}@${ref}  (${target}:${i + 1})`);
      continue;
    }

    let sha;
    try {
      sha = await resolveRef(ownerRepo, ref);
    } catch (error) {
      console.error(`error     ${ownerRepo}@${ref}: ${error.message}`);
      exitCode = 2;
      continue;
    }
    if (!sha) {
      console.error(`unresolved ${ownerRepo}@${ref}  (${target}:${i + 1})`);
      exitCode = 2;
      continue;
    }

    const comment = suffix.trim() === "" ? ` # ${ref}` : suffix;
    lines[i] = `${prefix}${ownerRepo}@${sha}${comment}`;
    touched = true;
    changed += 1;
    console.log(`pinned    ${ownerRepo}@${ref} -> ${sha.slice(0, 12)}`);
  }

  if (touched) {
    writeFileSync(path, lines.join("\n"));
    console.log(`updated   ${target}`);
  }
}

if (checkOnly) {
  console.log(
    floating === 0
      ? "all uses: entries are pinned to a full SHA"
      : `${floating} floating ref(s) — run without --check to pin them`,
  );
  if (floating > 0) exitCode = 1;
} else if (changed > 0) {
  console.log(`\n${changed} ref(s) pinned. Review the diff before committing.`);
}

process.exit(exitCode);
