#!/usr/bin/env node
/**
 * security-gate — the single verdict authority.
 *
 * Scanners never decide anything. Each one writes SARIF and a status line; this
 * file turns those into exactly one verdict:
 *
 *     SECURITY: PASS
 *     SECURITY: FAIL <n>
 *     SECURITY: ERROR (<reason>)
 *     SECURITY: SETUP (<reason>)
 *     SECURITY: OFF
 *
 * The last printed line is always the verdict, and it is also written to
 * $REPORT_DIR/verdict.txt so a later workflow step can publish it.
 *
 * FAIL-CLOSED: a scanner that is missing, crashed, reported nothing, or emitted
 * something this file does not understand is an ERROR — never a PASS. The only
 * path to PASS is every expected scanner reporting a report this file parsed.
 *
 * Usage:
 *   EXPECTED_SCANNERS=secrets,deps,sast node ci/normalize.mjs
 *
 * Environment:
 *   REPORT_DIR        default findings
 *   EXPECTED_SCANNERS comma list; falls back to $REPORT_DIR/expected.txt
 *   FAIL_ON           none | low | medium | high | critical   (default high)
 *   SECRET_FLOOR      default critical: a found secret is an incident
 *   BASELINE          default ci/security-baseline.json
 *   MAX_LIST          findings to print (default 15, 0 = none)
 *   SUMMARY_PATH      default $REPORT_DIR/summary.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const EXIT = { PASS: 0, FAIL: 1, ERROR: 2, SETUP: 3 };
const RANK = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
const BUCKETS = ["critical", "high", "medium", "low"];

const env = (key, fallback) => {
  const raw = process.env[key];
  const value = typeof raw === "string" ? raw.trim() : "";
  return value === "" ? fallback : value;
};

const REPORT_DIR = resolve(env("REPORT_DIR", "findings"));
const FAIL_ON = env("FAIL_ON", "high").toLowerCase();
const SECRET_FLOOR = env("SECRET_FLOOR", "critical").toLowerCase();
const BASELINE = resolve(env("BASELINE", join("ci", "security-baseline.json")));
const SUMMARY_PATH = resolve(env("SUMMARY_PATH", join(REPORT_DIR, "summary.json")));
const MAX_LIST = Number.parseInt(env("MAX_LIST", "15"), 10);

/* ---------------------------------------------------------------- findings */

const stripCwd = (path) => {
  const cwd = process.cwd();
  if (path === cwd) return ".";
  return path.startsWith(cwd + sep) ? path.slice(cwd.length + 1) : path;
};

const pathOf = (result) => {
  const uri = result?.locations?.[0]?.physicalLocation?.artifactLocation?.uri;
  if (typeof uri !== "string" || uri === "") return "(no path)";
  let out = uri.replace(/^file:\/\//, "");
  try {
    out = decodeURIComponent(out);
  } catch {
    /* keep the raw form when it is not valid percent-encoding */
  }
  return stripCwd(out.replace(/^\.\//, ""));
};

const lineOf = (result) => {
  const line = result?.locations?.[0]?.physicalLocation?.region?.startLine;
  return Number.isInteger(line) ? line : null;
};

const ruleOf = (result, rule) =>
  result?.ruleId ?? rule?.id ?? result?.rule?.id ?? result?.check_id ?? "(unknown-rule)";

/**
 * GitHub's own SARIF convention: `properties["security-severity"]` is a CVSS
 * score, bucketed at 9 / 7 / 4. Tools that carry no score fall back to the
 * SARIF `level` field.
 */
const bucketOf = (result, rule) => {
  // Score first, on the result then on the rule (both are legal SARIF).
  for (const holder of [result?.properties, rule?.properties]) {
    const raw = holder?.["security-severity"];
    const score = typeof raw === "number" ? raw : Number.parseFloat(raw);
    if (Number.isFinite(score)) {
      if (score >= 9) return "critical";
      if (score >= 7) return "high";
      if (score >= 4) return "medium";
      if (score > 0) return "low";
      return "none";
    }
  }
  // Then the level: the finding's own, else the rule's default.
  const level = result?.level ?? rule?.defaultConfiguration?.level ?? "warning";
  switch (String(level).toLowerCase()) {
    case "error":
      return "high";
    case "warning":
      return "medium";
    case "note":
      return "low";
    default:
      return "none";
  }
};

/** Returns { results } or { error }. Absence of `results` means zero findings. */
const parseSarif = (text) => {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (error) {
    return { error: `not JSON (${error.message})` };
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return { error: "top level is not a JSON object" };
  }
  if (typeof doc.version !== "string" || !doc.version.startsWith("2.")) {
    return { error: `not SARIF 2.x (version=${JSON.stringify(doc.version)})` };
  }
  if (!Array.isArray(doc.runs)) return { error: "runs is not an array" };

  const results = [];
  for (const [index, run] of doc.runs.entries()) {
    if (run?.invocations?.some((i) => i?.executionSuccessful === false)) {
      return { error: `run ${index} reports executionSuccessful=false` };
    }
    if (run?.results === undefined) continue;
    if (!Array.isArray(run.results)) {
      return { error: `run ${index} results is not an array` };
    }
    const rules = run?.tool?.driver?.rules;
    for (const result of run.results) {
      const rule = Array.isArray(rules) && Number.isInteger(result?.ruleIndex)
        ? rules[result.ruleIndex]
        : undefined;
      results.push({ result, rule });
    }
  }
  return { results };
};

/* ---------------------------------------------------------------- baseline */

/**
 * Waivers are `scanner:rule:path` — no line numbers, because lines move and a
 * waiver that silently stops matching is worse than no waiver at all.
 */
const loadBaseline = () => {
  const empty = { waivers: new Map(), errors: [] };
  if (!existsSync(BASELINE)) return empty;

  let doc;
  try {
    doc = JSON.parse(readFileSync(BASELINE, "utf8"));
  } catch (error) {
    return { ...empty, errors: [`baseline is not JSON (${error.message})`] };
  }
  if (doc?.version !== 1) {
    return { ...empty, errors: [`baseline version is ${JSON.stringify(doc?.version)}, expected 1`] };
  }
  if (!Array.isArray(doc.waivers)) {
    return { ...empty, errors: ["baseline.waivers is not an array"] };
  }

  const waivers = new Map();
  const errors = [];
  for (const [index, waiver] of doc.waivers.entries()) {
    const id = typeof waiver?.id === "string" ? waiver.id.trim() : "";
    const reason = typeof waiver?.reason === "string" ? waiver.reason.trim() : "";
    if (id === "") errors.push(`waiver ${index}: missing id`);
    // A waiver without a reason is a silent suppression, so it is not a waiver.
    if (reason === "") errors.push(`waiver ${index} (${id || "?"}): missing reason`);
    if (id !== "" && reason !== "") {
      waivers.set(id, {
        reason,
        expires: typeof waiver.expires === "string" ? waiver.expires : null,
      });
    }
  }
  return { waivers, errors };
};

const isExpired = (iso) => {
  if (!iso) return false;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return true;
  return at < Date.now();
};

/* -------------------------------------------------------------------- main */

const problems = []; // the environment or a scanner failed -> ERROR
const configErrors = []; // this project's own config is wrong -> SETUP

if (!existsSync(REPORT_DIR)) {
  problems.push(`no report directory at ${REPORT_DIR}`);
}

let scanners = env("EXPECTED_SCANNERS", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (scanners.length === 0 && existsSync(join(REPORT_DIR, "expected.txt"))) {
  scanners = readFileSync(join(REPORT_DIR, "expected.txt"), "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

const known = new Set(["none", "low", "medium", "high", "critical"]);
if (!known.has(FAIL_ON)) {
  configErrors.push(`FAIL_ON=${FAIL_ON} is not one of none|low|medium|high|critical`);
}
if (!known.has(SECRET_FLOOR)) {
  configErrors.push(`SECRET_FLOOR=${SECRET_FLOOR} is not one of none|low|medium|high|critical`);
}

const baseline = loadBaseline();
configErrors.push(...baseline.errors);

const findings = [];
const waived = [];
const expired = [];
const scannerState = {};

for (const scanner of scanners) {
  const statusPath = join(REPORT_DIR, `${scanner}.status`);
  const sarifPath = join(REPORT_DIR, `${scanner}.sarif`);
  const status = existsSync(statusPath)
    ? readFileSync(statusPath, "utf8").trim().toLowerCase()
    : "";

  scannerState[scanner] = { status: status || "missing", results: 0 };

  // A scanner that did not say "ok" cannot vouch for the tree.
  if (status !== "ok") {
    const detailPath = join(REPORT_DIR, `${scanner}.detail`);
    const detail = existsSync(detailPath) ? readFileSync(detailPath, "utf8").trim() : "";
    problems.push(`${scanner}: ${status || "no status file"}${detail ? ` (${detail})` : ""}`);
    continue;
  }
  if (!existsSync(sarifPath)) {
    problems.push(`${scanner}: reported ok but wrote no SARIF`);
    continue;
  }

  const parsed = parseSarif(readFileSync(sarifPath, "utf8"));
  if (parsed.error) {
    problems.push(`${scanner}: unusable SARIF — ${parsed.error}`);
    continue;
  }

  scannerState[scanner].results = parsed.results.length;

  for (const { result, rule: ruleDoc } of parsed.results) {
    const rule = String(ruleOf(result, ruleDoc));
    const path = pathOf(result);
    const id = `${scanner}:${rule}:${path}`;
    let severity = bucketOf(result, ruleDoc);
    // A committed secret is an incident, not a warning, whatever the tool said.
    if (scanner === "secrets" && RANK[severity] < RANK[SECRET_FLOOR]) {
      severity = SECRET_FLOOR;
    }

    const entry = { id, scanner, rule, path, line: lineOf(result), severity };
    const waiver = baseline.waivers.get(id);

    if (waiver && isExpired(waiver.expires)) {
      expired.push({ ...entry, expires: waiver.expires });
      findings.push({ ...entry, waiver: "expired" });
    } else if (waiver) {
      waived.push({ ...entry, reason: waiver.reason, expires: waiver.expires });
    } else {
      findings.push(entry);
    }
  }
}

if (scanners.length === 0) {
  // No scanners armed is not a pass: an empty gate proves nothing. The verdict
  // still has to be the last line, because that is the line the workflow reads.
  const verdict = "SECURITY: OFF";
  console.log("=== security-gate ===");
  console.log("no scanners armed (SCANNERS / EXPECTED_SCANNERS is empty)");
  console.log(verdict);
  writeSummary({ verdict, state: "OFF", failing: 0, counts: zeroCounts() });
  process.exit(EXIT.ERROR);
}

const counts = zeroCounts();
for (const finding of findings) counts[finding.severity] += 1;

const threshold = RANK[FAIL_ON];
const failing = findings.filter((f) => RANK[f.severity] >= threshold && threshold > 0);
const failCount = FAIL_ON === "none" ? 0 : failing.length;

// A wrong config is not the scanners' fault and is not a finding either, so it
// keeps its own code: SETUP tells you to fix the project, ERROR to look outside.
const state =
  configErrors.length > 0 ? "SETUP" : problems.length > 0 ? "ERROR" : failCount > 0 ? "FAIL" : "PASS";
const exitCode =
  state === "SETUP"
    ? EXIT.SETUP
    : state === "ERROR"
      ? EXIT.ERROR
      : state === "FAIL"
        ? EXIT.FAIL
        : EXIT.PASS;

/* ---------------------------------------------------------------- reports */

const line = (() => {
  if (state === "PASS") {
    return FAIL_ON === "none" ? "SECURITY: PASS (shadow: FAIL_ON=none)" : "SECURITY: PASS";
  }
  if (state === "FAIL") return `SECURITY: FAIL ${failCount}`;
  if (state === "SETUP") return `SECURITY: SETUP (${configErrors.join("; ")})`;
  return `SECURITY: ERROR (${problems.join("; ")})`;
})();

const detail = [
  configErrors.length ? `config: ${configErrors.join("; ")}` : "",
  problems.length ? `problems: ${problems.join("; ")}` : "",
]
  .filter(Boolean)
  .join("\n");

console.log("=== security-gate ===");
console.log(
  `scanners: ${Object.entries(scannerState)
    .map(([name, info]) => `${name}=${info.status}/${info.results}`)
    .join(" ") || "(none)"}`,
);
console.log(`threshold: ${FAIL_ON}   results: ${findings.length}   waived: ${waived.length}`);
if (detail) console.log(detail);
for (const finding of expired) {
  console.log(`- [expired-waiver ${finding.expires ?? "no expiry"}] ${finding.id}`);
}

const shown = Number.isFinite(MAX_LIST) && MAX_LIST > 0 ? failing.slice(0, MAX_LIST) : [];
for (const finding of shown) {
  const where = finding.line === null ? finding.path : `${finding.path}:${finding.line}`;
  // Never echo a secrets message: the whole point is that the value is not in the log.
  const subject = finding.scanner === "secrets" ? "" : ` ${finding.rule}`;
  console.log(`- [${finding.severity}]${subject} ${where}`);
}
if (failing.length > shown.length) {
  console.log(`  … and ${failing.length - shown.length} more (see summary.json)`);
}
if (failCount === 0 && findings.length > 0 && state !== "ERROR") {
  console.log(`(below threshold ${FAIL_ON}: ${findings.length} findings not gating)`);
}
for (const waiver of waived.slice(0, MAX_LIST)) {
  console.log(`- [waived] ${waiver.id} — ${waiver.reason}`);
}

console.log(line);

writeSummary({
  verdict: line,
  state,
  failing: failCount,
  counts,
  problems,
  configErrors,
});

process.exit(exitCode);

/* ------------------------------------------------------------------ utils */

function zeroCounts() {
  return Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0]));
}

function writeSummary({ verdict, state, failing, counts, problems: issues = [], configErrors: config = [] }) {
  const payload = {
    version: 1,
    verdict,
    state,
    failOn: FAIL_ON,
    secretFloor: SECRET_FLOOR,
    failing,
    counts,
    waived: waived.length,
    expiredWaivers: expired.length,
    problems: issues,
    configErrors: config,
    scanners: scannerState,
    results: findings.length,
    baseline: BASELINE,
    findings: findings.slice(0, 500),
  };
  try {
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(SUMMARY_PATH, `${JSON.stringify(payload, null, 2)}\n`);
    writeFileSync(join(REPORT_DIR, "verdict.txt"), `${verdict}\n`);
  } catch (error) {
    console.error(`could not write ${SUMMARY_PATH}: ${error.message}`);
  }
}
