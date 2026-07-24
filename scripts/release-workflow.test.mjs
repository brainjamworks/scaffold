import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parse as parseYaml } from "yaml";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_PATH = resolve(REPOSITORY_ROOT, ".github/workflows/release.yml");

function loadWorkflow() {
  const source = readFileSync(WORKFLOW_PATH, "utf8");
  return { source, workflow: parseYaml(source) };
}

function actionReferences(workflow) {
  return Object.values(workflow.jobs).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => (step.uses ? [step.uses] : [])),
  );
}

test("release workflow is tag-driven and candidate-only", () => {
  const { source, workflow } = loadWorkflow();

  assert.deepEqual(workflow.on, { push: { tags: ["v*.*.*"] } });
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.deepEqual(Object.keys(workflow.jobs), ["gate", "package", "attest", "draft"]);
  assert.deepEqual(workflow.jobs.package.needs, "gate");
  assert.deepEqual(workflow.jobs.attest.needs, ["gate", "package"]);
  assert.deepEqual(workflow.jobs.draft.needs, ["gate", "package", "attest"]);

  assert.match(source, /node scripts\/prepare-release-candidate\.mjs/);
  assert.match(source, /\.app\.slug == "github-actions"/);
  assert.match(source, /vp run @scaffold\/adapter-moodle#package/);
  assert.match(source, /vp run @scaffold\/adapter-xblock#package/);
  assert.match(source, /subject-checksums:/);
  assert.match(source, /gh release create/);
  assert.match(source, /--verify-tag/);
  assert.match(source, /--draft/);
  assert.match(source, /--prerelease/);
  assert.match(source, /handoff_directory="dist\/release-candidate-handoff"/);
  assert.doesNotMatch(source, /\.tmp\/release-candidate/);
  assert.doesNotMatch(source, /verify:release/);
  assert.doesNotMatch(source, /pypi|marketplace|--draft=false/i);
});

test("release workflow grants elevated permissions only after package building", () => {
  const { workflow } = loadWorkflow();

  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(workflow.jobs.gate.permissions, {
    checks: "read",
    contents: "read",
  });
  assert.deepEqual(workflow.jobs.package.permissions, { contents: "read" });
  assert.deepEqual(workflow.jobs.attest.permissions, {
    attestations: "write",
    contents: "read",
    "id-token": "write",
  });
  assert.deepEqual(workflow.jobs.draft.permissions, { contents: "write" });
});

test("release workflow pins every action to a full commit SHA", () => {
  const { workflow } = loadWorkflow();
  const references = actionReferences(workflow);

  assert.ok(references.length > 0);
  for (const reference of references) {
    assert.match(reference, /@[0-9a-f]{40}$/, reference);
  }
});
