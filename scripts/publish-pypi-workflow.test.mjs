import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parse as parseYaml } from "yaml";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_PATH = resolve(REPOSITORY_ROOT, ".github/workflows/publish-pypi.yml");

function loadWorkflow() {
  const source = readFileSync(WORKFLOW_PATH, "utf8");
  return { source, workflow: parseYaml(source) };
}

function actionReferences(workflow) {
  return Object.values(workflow.jobs).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => (step.uses ? [step.uses] : [])),
  );
}

test("PyPI workflow publishes only after approval and supports explicit retries", () => {
  const { source, workflow } = loadWorkflow();

  assert.deepEqual(workflow.on.release, { types: ["published"] });
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.tag, {
    description: "Published release tag to retry",
    required: true,
    type: "string",
  });
  assert.deepEqual(Object.keys(workflow.jobs), ["publish"]);
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.match(workflow.jobs.publish.if, /github\.ref == 'refs\/heads\/main'/);

  assert.match(source, /Release tag must use vMAJOR\.MINOR\.PATCH/);
  assert.match(source, /Refusing to publish from draft release/);
  assert.match(source, /Refusing to publish a non-prerelease/);
  assert.match(source, /Moodle smoke test: passed on/);
  assert.match(source, /Open edX smoke test: passed on/);
  assert.match(source, /unexpected release asset/);
  assert.match(source, /gh release download/);
  assert.match(source, /sha256sum --check SHA256SUMS/);
  assert.match(source, /gh attestation verify/);
  assert.match(source, /--bundle/);
  assert.match(source, /--cert-identity/);
  assert.match(source, /--source-digest/);
  assert.match(source, /--source-ref/);
  assert.match(source, /pypi\.org\/pypi\/scaffold-xblock/);
  assert.match(source, /existing PyPI digest/);
  assert.match(source, /unexpected PyPI distribution/);
  assert.match(source, /yanked/);
  assert.match(source, /upload_count/);
  assert.doesNotMatch(source, /outputs\.[A-Za-z0-9_]*-/);
});

test("PyPI distributions are staged where the Docker publisher can read them", () => {
  const { workflow } = loadWorkflow();
  const stage = workflow.jobs.publish.steps.find(
    (step) => step.name === "Stage missing PyPI distributions",
  );
  const publish = workflow.jobs.publish.steps.find(
    (step) => step.name === "Publish verified XBlock distributions",
  );

  assert.match(stage.run, /\$GITHUB_WORKSPACE\/\.pypi-dist/);
  assert.doesNotMatch(stage.run, /\$RUNNER_TEMP\/publish/);
  assert.equal(publish.with["packages-dir"], ".pypi-dist/");
});

test("PyPI workflow grants only release-read and publishing identity permissions", () => {
  const { workflow } = loadWorkflow();
  const job = workflow.jobs.publish;

  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(job.permissions, {
    contents: "read",
    "id-token": "write",
  });
  assert.deepEqual(job.environment, {
    name: "pypi",
    url: "https://pypi.org/project/scaffold-xblock/",
  });
});

test("PyPI workflow pins its publisher and never rebuilds or uses stored credentials", () => {
  const { source, workflow } = loadWorkflow();
  const references = actionReferences(workflow);

  assert.deepEqual(references, [
    "pypa/gh-action-pypi-publish@ba38be9e461d3875417946c167d0b5f3d385a247",
  ]);
  for (const reference of references) {
    assert.match(reference, /@[0-9a-f]{40}$/, reference);
  }

  assert.doesNotMatch(source, /actions\/checkout/);
  assert.doesNotMatch(source, /python\s+-m\s+build/);
  assert.doesNotMatch(source, /vp run .*#package/);
  assert.doesNotMatch(source, /twine upload/);
  assert.doesNotMatch(source, /skip-existing/);
  assert.doesNotMatch(source, /secrets\.|password:/);
});

test("PyPI workflow inline shell passes Bash syntax validation", () => {
  const { workflow } = loadWorkflow();
  const scripts = workflow.jobs.publish.steps.flatMap((step) => (step.run ? [step.run] : []));

  assert.ok(scripts.length > 0);
  for (const script of scripts) {
    const result = spawnSync("bash", ["-n"], {
      encoding: "utf8",
      input: script,
    });
    assert.equal(result.status, 0, result.stderr);
  }
});
