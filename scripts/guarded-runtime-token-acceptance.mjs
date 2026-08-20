#!/usr/bin/env node
import { readFileSync } from "node:fs";
import process from "node:process";

const VERSION = "matterhorn.guarded-runtime-token-evidence.v1";

function parseArgs(argv) {
  const config = { baseline: "", candidate: "", strict: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--baseline") config.baseline = next();
    else if (arg === "--candidate") config.candidate = next();
    else if (arg === "--strict") config.strict = true;
    else if (arg === "--json") config.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!config.baseline || !config.candidate) throw new Error("--baseline and --candidate are required.");
  return config;
}

function readEvidence(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (value?.version !== VERSION || !Array.isArray(value.scenarios)) {
    throw new Error(`${path} is not ${VERSION} evidence.`);
  }
  return value;
}

function percentile95(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function finitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function evaluate(baseline, candidate) {
  const checks = [];
  const add = (id, pass, summary) => checks.push({ id, status: pass ? "pass" : "fail", summary });
  const baselineById = new Map(baseline.scenarios.map((scenario) => [scenario.id, scenario]));
  const candidateIds = new Set(candidate.scenarios.map((scenario) => scenario.id));
  add(
    "scenario_set",
    baselineById.size > 0 && baselineById.size === candidateIds.size && [...baselineById.keys()].every((id) => candidateIds.has(id)),
    "Baseline and candidate contain the same fixed hosted scenarios.",
  );
  const scenarios = [];
  for (const candidateScenario of candidate.scenarios) {
    const prior = baselineById.get(candidateScenario.id);
    const baselineTokens = prior?.providerInputTokens;
    const candidateTokens = candidateScenario.providerInputTokens;
    const measured = finitePositive(baselineTokens) && finitePositive(candidateTokens);
    const reductionPct = measured ? ((baselineTokens - candidateTokens) / baselineTokens) * 100 : null;
    const quality = candidateScenario.quality ?? {};
    const qualityPass = quality.citations === true
      && quality.actionTerms === true
      && quality.riskWarnings === true
      && quality.receiptComplete === true;
    add(
      `tokens_${candidateScenario.id}`,
      measured && reductionPct >= 40,
      measured
        ? `${candidateScenario.id} repeated provider input tokens changed by ${reductionPct.toFixed(1)}%.`
        : `${candidateScenario.id} is missing provider-reported input-token evidence.`,
    );
    add(
      `quality_${candidateScenario.id}`,
      qualityPass,
      `${candidateScenario.id} retains citations, action terms, risk warnings, and receipt fields.`,
    );
    scenarios.push({ id: candidateScenario.id, baselineProviderInputTokens: baselineTokens ?? null, candidateProviderInputTokens: candidateTokens ?? null, reductionPct });
  }
  const overhead = Array.isArray(candidate.policyOverheadMs)
    ? candidate.policyOverheadMs.filter((value) => Number.isFinite(value) && value >= 0)
    : [];
  const p95 = percentile95(overhead);
  add("policy_overhead_p95", p95 !== null && p95 < 100, p95 === null
    ? "Candidate is missing text-only privacy/policy overhead measurements."
    : `Text-only privacy/policy overhead p95 is ${p95.toFixed(2)}ms.`);
  const failures = checks.filter((check) => check.status === "fail");
  return {
    version: "matterhorn.guarded-runtime-token-acceptance.v1",
    ok: failures.length === 0,
    checks,
    failures,
    scenarios,
    policyOverheadP95Ms: p95,
  };
}

try {
  const config = parseArgs(process.argv.slice(2));
  const report = evaluate(readEvidence(config.baseline), readEvidence(config.candidate));
  if (config.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${report.ok ? "PASS" : "FAIL"}: ${report.checks.length - report.failures.length}/${report.checks.length} guarded-runtime token checks passed.\n`);
  if (config.strict && !report.ok) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
