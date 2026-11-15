#!/usr/bin/env node
/**
 * security-gate — test-normalize.mjs
 *
 * Self-test for the decider. No network, no scanners, no fixtures on disk: it
 * generates synthetic SARIF, runs normalize.mjs against it, and asserts the
 * verdict line, the exit code, and that the verdict is the LAST line printed
 * (a later workflow step publishes exactly that line).
 *
 *   node ci/test-normalize.mjs      # exit 0 = the decider behaves
 *
 * Run this after editing normalize.mjs, and before bumping a scanner version.
 * The properties worth protecting are the fail-closed ones: a case that starts
 * passing after a refactor is a regression, not an improvement.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const NORM = join(HERE, "normalize.mjs");
const ROOT = join(process.env.SECURITY_GATE_TEST_DIR || tmpdir(), "security-gate-selftest");

const sarif = (results) =>
  JSON.stringify({ version: "2.1.0", runs: [{ tool: { driver: { name: "fixture" } }, results }] }, null, 2);

const finding = (ruleId, uri, line, level, score) => {
  const out = {
    ruleId,
    level,
    message: { text: `fixture message for ${ruleId} containing a secret-looking value` },
    locations: [{ physicalLocation: { artifactLocation: { uri }, region: { startLine: line } } }],
  };
  if (score !== undefined) out.properties = { "security-severity": score };
  return out;
};

const SECRET = finding("github-pat", "src/leak.py", 7, "error");
const DEPS_HIGH = [
  finding("GHSA-aaaa", "requirements.txt", 1, "warning", 8.1),
  finding("GHSA-bbbb", "requirements.txt", 2, "warning", 7.4),
];
const SAST_MED = [finding("python.eval-detected", "src/app.py", 12, "warning", 5.5)];

let failures = 0;
const check = (name, condition, detail = "") => {
  if (condition) return;
  failures += 1;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
};

const run = ({ name, findings, env = {}, baseline }) => {
  const dir = join(ROOT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "findings"), { recursive: true });
  mkdirSync(join(dir, "ci"), { recursive: true });

  for (const [scanner, spec] of Object.entries(findings)) {
    if (spec.status !== undefined) writeFileSync(join(dir, "findings", `${scanner}.status`), `${spec.status}\n`);
    if (spec.sarif !== undefined) {
      writeFileSync(join(dir, "findings", `${scanner}.sarif`), typeof spec.sarif === "string" ? spec.sarif : sarif(spec.sarif));
    }
  }
  if (baseline !== undefined) writeFileSync(join(dir, "ci", "security-baseline.json"), baseline);

  const result = spawnSync(process.execPath, [NORM], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EXPECTED_SCANNERS: Object.keys(findings).join(","), ...env },
  });

  const stdout = result.stdout ?? "";
  const lines = stdout.trim().split("\n");
  const last = lines[lines.length - 1] ?? "";

  let summary = null;
  let verdictFile = null;
  try {
    summary = JSON.parse(readFileSync(join(dir, "findings", "summary.json"), "utf8"));
  } catch {
    /* asserted below where it matters */
  }
  try {
    verdictFile = readFileSync(join(dir, "findings", "verdict.txt"), "utf8").trim();
  } catch {
    /* ditto */
  }

  return { dir, name, stdout, last, status: result.status, summary, verdictFile };
};

const expect = (result, { verdict, prefix, exit }) => {
  const label = result.name;
  check(`${label}: exit ${exit}`, result.status === exit, `got ${result.status}`);
  if (prefix) {
    check(`${label}: verdict starts with "${prefix}"`, result.last.startsWith(prefix), `got "${result.last}"`);
  } else {
    check(`${label}: verdict "${verdict}"`, result.last === verdict, `got "${result.last}"`);
  }
  check(`${label}: verdict is the last line`, result.stdout.trimEnd().endsWith(result.last));
  check(`${label}: verdict.txt mirrors it`, result.verdictFile === result.last, `got "${result.verdictFile}"`);
  if (failures === 0) console.log(`ok    ${label}  -> ${result.last}`);
};

const ALL = {
  secrets: { status: "ok", sarif: [SECRET] },
  deps: { status: "ok", sarif: DEPS_HIGH },
  sast: { status: "ok", sarif: SAST_MED },
};

// 1 — findings above the threshold fail, with a count.
{
  const r = run({ name: "fail-above-threshold", findings: ALL });
  expect(r, { verdict: "SECURITY: FAIL 3", exit: 1 });
  check("counts: 1 critical, 2 high", r.summary?.counts?.critical === 1 && r.summary?.counts?.high === 2);
  check("secrets floored to critical", r.summary?.counts?.critical === 1);
  check("no secret text in the log", !r.stdout.includes("secret-looking value"));
}

// 2 — everything below the threshold passes.
expect(
  run({ name: "pass-below-threshold", findings: { sast: { status: "ok", sarif: SAST_MED } }, env: { FAIL_ON: "high" } }),
  { verdict: "SECURITY: PASS", exit: 0 },
);

// 3 — shadow mode reports, never fails.
{
  const r = run({ name: "shadow-mode", findings: ALL, env: { FAIL_ON: "none" } });
  expect(r, { verdict: "SECURITY: PASS (shadow: FAIL_ON=none)", exit: 0 });
  check("shadow keeps counts", r.summary?.counts?.critical === 1);
}

// 4 — a scanner that reported nothing is not a pass.
expect(run({ name: "missing-status", findings: { ...ALL, deps: { sarif: [] } } }), {
  verdict: "SECURITY: ERROR (deps: no status file)",
  exit: 2,
});

// 5 — a crashed scanner is not a pass.
expect(
  run({ name: "crashed-scanner", findings: { secrets: { status: "ok", sarif: [SECRET] }, deps: { status: "crashed", sarif: "" } } }),
  { verdict: "SECURITY: ERROR (deps: crashed)", exit: 2 },
);

// 6 — non-SARIF output is not a pass.
expect(run({ name: "garbage-sarif", findings: { sast: { status: "ok", sarif: "<html>proxy error</html>" } } }), {
  prefix: "SECURITY: ERROR (sast: unusable SARIF — not JSON",
  exit: 2,
});

// 7 — a report that says the tool itself failed is not a pass.
expect(
  run({
    name: "tool-reported-failure",
    findings: {
      deps: {
        status: "ok",
        sarif: JSON.stringify({
          version: "2.1.0",
          runs: [{ tool: { driver: { name: "x" } }, invocations: [{ executionSuccessful: false }], results: [] }],
        }),
      },
    },
  }),
  { verdict: "SECURITY: ERROR (deps: unusable SARIF — run 0 reports executionSuccessful=false)", exit: 2 },
);

// 8 — nothing armed proves nothing.
{
  const dir = join(ROOT, "off");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "findings"), { recursive: true });
  const out = spawnSync(process.execPath, [NORM], { cwd: dir, encoding: "utf8", env: { ...process.env, EXPECTED_SCANNERS: "" } });
  check("off: exit 2", out.status === 2, `got ${out.status}`);
  check("off: verdict is OFF", out.stdout.trim().split("\n").pop() === "SECURITY: OFF", `got "${out.stdout.trim()}"`);
  if (failures === 0) console.log("ok    off  -> SECURITY: OFF");
}

// 9 — an unexpired waiver removes one finding.
{
  const r = run({
    name: "waived",
    findings: ALL,
    baseline: JSON.stringify({
      version: 1,
      waivers: [{ id: "deps:GHSA-aaaa:requirements.txt", reason: "dev-only, not reachable", expires: "2999-01-01" }],
    }),
  });
  expect(r, { verdict: "SECURITY: FAIL 2", exit: 1 });
  check("waived: recorded in summary", r.summary?.waived === 1, `got ${r.summary?.waived}`);
}

// 10 — an expired waiver stops waiving, and says so.
{
  const r = run({
    name: "expired-waiver",
    findings: ALL,
    baseline: JSON.stringify({
      version: 1,
      waivers: [{ id: "deps:GHSA-aaaa:requirements.txt", reason: "temporary", expires: "2001-01-01" }],
    }),
  });
  expect(r, { verdict: "SECURITY: FAIL 3", exit: 1 });
  check("expired: counted, not waived", r.summary?.expiredWaivers === 1 && r.summary?.waived === 0);
  check("expired: named in the log", r.stdout.includes("expired-waiver"));
}

// 11 — a waiver with no reason is a config error.
expect(
  run({
    name: "waiver-without-reason",
    findings: ALL,
    baseline: JSON.stringify({ version: 1, waivers: [{ id: "deps:GHSA-aaaa:requirements.txt" }] }),
  }),
  { verdict: "SECURITY: SETUP (waiver 0 (deps:GHSA-aaaa:requirements.txt): missing reason)", exit: 3 },
);

// 12 — an unrecognised threshold is not a green build.
expect(run({ name: "bad-threshold", findings: ALL, env: { FAIL_ON: "highish" } }), {
  verdict: "SECURITY: SETUP (FAIL_ON=highish is not one of none|low|medium|high|critical)",
  exit: 3,
});

// 13 — an id the driver let through still fails closed.
expect(run({ name: "unknown-scanner", findings: { trivy: { status: "crashed", sarif: "" } } }), {
  verdict: "SECURITY: ERROR (trivy: crashed)",
  exit: 2,
});

rmSync(ROOT, { recursive: true, force: true });

console.log("");
if (failures > 0) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("all normalize.mjs assertions passed");
