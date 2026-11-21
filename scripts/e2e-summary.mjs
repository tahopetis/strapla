/**
 * Writes a per-test table for a regression run into the GitHub job summary.
 *
 * Reads the JUnit report Playwright writes in CI. Runs with `if: always()`, so
 * it must tolerate a missing report (the run failed before a test finished) and
 * must never throw — a failing summary step would hide the actual result.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const JUNIT = 'test-results/junit.xml';
const summaryFile = process.env.GITHUB_STEP_SUMMARY;

function emit(markdown) {
  if (summaryFile) appendFileSync(summaryFile, markdown);
  else process.stdout.write(markdown);
}

function decode(value) {
  return value
    .replace(/&#10;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Literal patterns for the three attributes the summary reads. Building a
// RegExp from the attribute name made this a non-literal regexp, which the
// security gate (rightly) flags; a fixed table says exactly what is parsed.
const ATTRIBUTE_PATTERNS = {
  name: /\bname="([^"]*)"/,
  classname: /\bclassname="([^"]*)"/,
  time: /\btime="([^"]*)"/,
};

function attribute(attributes, name) {
  const pattern = ATTRIBUTE_PATTERNS[name];
  const match = pattern ? attributes.match(pattern) : null;
  return match ? decode(match[1] ?? '') : '';
}

function firstLine(body) {
  const match = body.match(/<failure\b[^>]*message="([^"]*)"/);
  if (!match) return '';
  return decode(match[1]).split('\n')[0].slice(0, 160);
}

function runLink() {
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  return repo && runId ? `https://github.com/${repo}/actions/runs/${runId}` : '';
}

function main() {
  const tier = process.env.TIER || 'all';
  const link = runLink();
  emit(`\n## Playwright regression — tier ${tier}\n\n`);

  if (!existsSync(JUNIT)) {
    emit(
      'No JUnit report was produced: the run failed before a test finished. Read the log above, then download the artifacts.\n',
    );
    return;
  }

  const xml = readFileSync(JUNIT, 'utf8');
  const cases = [];
  const pattern = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const match of xml.matchAll(pattern)) {
    const attributes = match[1] ?? '';
    const body = match[3] ?? '';
    const status = /<failure\b/.test(body) ? 'failed' : /<skipped\b/.test(body) ? 'skipped' : 'passed';
    cases.push({
      name: attribute(attributes, 'name'),
      className: attribute(attributes, 'classname'),
      time: Number(attribute(attributes, 'time') || '0'),
      status,
      error: firstLine(body),
    });
  }

  const passed = cases.filter((testCase) => testCase.status === 'passed').length;
  const failed = cases.filter((testCase) => testCase.status === 'failed').length;
  const skipped = cases.filter((testCase) => testCase.status === 'skipped').length;
  const totalSeconds = Math.round(cases.reduce((sum, testCase) => sum + testCase.time, 0));

  emit(
    `**${passed} passed, ${failed} failed, ${skipped} skipped** · ${cases.length} tests · ${totalSeconds}s of test time${link ? ` · [run log](${link})` : ''}\n\n`,
  );

  if (failed > 0) {
    emit('### Failures\n\n| Spec | Test | Error |\n| --- | --- | --- |\n');
    for (const testCase of cases.filter((entry) => entry.status === 'failed')) {
      const spec = testCase.className.split('›')[0]?.trim() ?? testCase.className;
      emit(`| ${spec} | ${testCase.name} | ${testCase.error || '—'} |\n`);
    }
    emit('\n');
  }

  const slowest = [...cases].sort((a, b) => b.time - a.time).slice(0, 10);
  if (slowest.length > 0) {
    emit('### Slowest tests\n\n| Test | Spec | Seconds | Result |\n| --- | --- | --- | --- |\n');
    for (const testCase of slowest) {
      const spec = testCase.className.split('›')[0]?.trim() ?? testCase.className;
      emit(`| ${testCase.name} | ${spec} | ${testCase.time.toFixed(1)} | ${testCase.status} |\n`);
    }
    emit('\n');
  }

  emit(
    'Coverage map and known gaps: `docs/REGRESSION.md`. Traces, video and the HTML report are in the `playwright-regression` artifact.\n',
  );
}

try {
  main();
} catch (error) {
  emit(`\nRegression summary could not be built: ${error instanceof Error ? error.message : String(error)}\n`);
}
