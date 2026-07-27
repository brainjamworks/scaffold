import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parse as parseYaml } from "yaml";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_PATH = resolve(REPOSITORY_ROOT, ".github/workflows/release.yml");
const APPROVAL_WORKFLOW_PATH = resolve(REPOSITORY_ROOT, ".github/workflows/approve-release.yml");

function loadWorkflow() {
  const source = readFileSync(WORKFLOW_PATH, "utf8");
  return { source, workflow: parseYaml(source) };
}

function actionReferences(workflow) {
  return Object.values(workflow.jobs).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => (step.uses ? [step.uses] : [])),
  );
}

test("release workflow is tag-selected, retryable, and candidate-only", () => {
  const { source, workflow } = loadWorkflow();

  assert.deepEqual(workflow.on, {
    push: { tags: ["v*.*.*"] },
    workflow_dispatch: {
      inputs: {
        tag: {
          description: "Annotated release tag to retry",
          required: true,
          type: "string",
        },
      },
    },
  });
  assert.equal(workflow.concurrency.group, "release-candidate-${{ inputs.tag || github.ref }}");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.deepEqual(Object.keys(workflow.jobs), ["gate", "package", "attest", "draft"]);
  assert.deepEqual(workflow.jobs.package.needs, "gate");
  assert.deepEqual(workflow.jobs.attest.needs, ["gate", "package"]);
  assert.deepEqual(workflow.jobs.draft.needs, ["gate", "package", "attest"]);

  assert.match(source, /node scripts\/prepare-release-candidate\.mjs/);
  assert.match(source, /actions\/workflows\/ci\.yml\/runs/);
  assert.match(source, /actions\/runs\/\$run_id\/artifacts/);
  assert.match(source, /moodle-plugin-candidate/);
  assert.match(source, /ci_run_id=/);
  assert.doesNotMatch(source, /commits\/\$RELEASE_COMMIT\/check-runs/);
  assert.doesNotMatch(source, /vp run @scaffold\/adapter-moodle#package/);
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

test("release workflow pins its build environment and revalidates tag identity", () => {
  const { source, workflow } = loadWorkflow();

  for (const job of Object.values(workflow.jobs)) {
    assert.equal(job["runs-on"], "ubuntu-24.04");
  }
  const setupVp = workflow.jobs.package.steps.find((step) =>
    step.uses?.startsWith("voidzero-dev/setup-vp@"),
  );
  const setupPython = workflow.jobs.package.steps.find((step) =>
    step.uses?.startsWith("actions/setup-python@"),
  );
  assert.equal(setupVp.with["node-version"], "24.18.0");
  assert.equal(setupPython.with["python-version"], "3.12.10");

  const checkout = workflow.jobs.gate.steps.find((step) => step.name === "Checkout tagged source");
  const identity = workflow.jobs.gate.steps.find(
    (step) => step.name === "Validate tag, commit, and coordinated versions",
  );
  assert.equal(checkout.with.ref, "${{ inputs.tag || github.ref }}");
  assert.equal(identity.env.RELEASE_TAG, "${{ inputs.tag || github.ref_name }}");
  assert.match(source, /tag_object=/);
  assert.match(source, /git\/ref\/tags\/\$RELEASE_TAG/);
  assert.match(source, /git\/tags\/\$EXPECTED_TAG_OBJECT/);
  assert.match(source, /EXPECTED_RELEASE_COMMIT/);
});

test("draft mutation has explicit repository context and preserves reviewed notes", () => {
  const { workflow } = loadWorkflow();
  const step = workflow.jobs.draft.steps.find(
    (candidate) => candidate.name === "Create or safely complete the draft",
  );

  assert.equal(step.env.GH_REPO, "${{ github.repository }}");
  assert.match(step.run, /gh release create/);
  assert.match(step.run, /gh release edit/);

  const existingDraftBranch = step.run.slice(
    step.run.indexOf('if [[ "$release_status" == "200" ]]'),
    step.run.indexOf('elif [[ "$release_status" == "404" ]]'),
  );
  assert.doesNotMatch(existingDraftBranch, /--notes-file/);
});

test("release workflow grants elevated permissions only after package building", () => {
  const { workflow } = loadWorkflow();

  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(workflow.jobs.gate.permissions, {
    actions: "read",
    contents: "read",
  });
  assert.deepEqual(workflow.jobs.package.permissions, {
    actions: "read",
    contents: "read",
  });
  assert.deepEqual(workflow.jobs.attest.permissions, {
    attestations: "write",
    contents: "read",
    "id-token": "write",
  });
  assert.deepEqual(workflow.jobs.draft.permissions, { contents: "write" });
});

test("release package downloads the exact tested Moodle candidate from the selected CI run", () => {
  const { workflow } = loadWorkflow();

  assert.equal(workflow.jobs.gate.outputs.ci_run_id, "${{ steps.source_ci.outputs.ci_run_id }}");

  const download = workflow.jobs.package.steps.find(
    (step) => step.name === "Download tested Moodle candidate",
  );
  assert.ok(download);
  assert.match(download.uses, /^actions\/download-artifact@[0-9a-f]{40}$/);
  assert.deepEqual(download.with, {
    name: "moodle-plugin-candidate",
    path: "${{ runner.temp }}/moodle-plugin-candidate",
    "github-token": "${{ github.token }}",
    repository: "${{ github.repository }}",
    "run-id": "${{ needs.gate.outputs.ci_run_id }}",
  });

  const stage = workflow.jobs.package.steps.find(
    (step) => step.name === "Stage tested Moodle candidate",
  );
  assert.ok(stage?.run);
  assert.match(stage.run, /Expected exactly one tested Moodle candidate/);
  assert.match(stage.run, /sha256sum --check/);
  assert.match(stage.run, /mod_scaffold-\$RELEASE_VERSION\.zip/);
  assert.match(stage.run, /release-evidence\.json/);
  assert.match(stage.run, /CI_RUN_ID/);
  assert.match(stage.run, /moodle_candidate/);

  const assemble = workflow.jobs.package.steps.find(
    (step) => step.name === "Assemble candidate evidence",
  );
  assert.match(assemble.run, /release-evidence\.json/);
  const draft = workflow.jobs.draft.steps.find(
    (step) => step.name === "Create or safely complete the draft",
  );
  assert.match(draft.run, /release-evidence\.json/);
});

test("release workflow builds workspace dependencies before packaging the XBlock", () => {
  const { workflow } = loadWorkflow();
  const steps = workflow.jobs.package.steps;
  const buildIndex = steps.findIndex((step) => step.name === "Build workspace dependencies");
  const packageIndex = steps.findIndex((step) => step.name === "Package XBlock");

  assert.notEqual(buildIndex, -1);
  assert.notEqual(packageIndex, -1);
  assert.ok(buildIndex < packageIndex);
  assert.equal(steps[buildIndex].run, "vp run verify:build");
  assert.equal(steps[packageIndex].run, "vp run @scaffold/adapter-xblock#package");
});

test("release workflow pins every action to a full commit SHA", () => {
  const { workflow } = loadWorkflow();
  const references = actionReferences(workflow);

  assert.ok(references.length > 0);
  for (const reference of references) {
    assert.match(reference, /@[0-9a-f]{40}$/, reference);
  }
});

test("approval workflow validates the private draft before publishing it", () => {
  const source = readFileSync(APPROVAL_WORKFLOW_PATH, "utf8");
  const workflow = parseYaml(source);

  assert.deepEqual(workflow.on, {
    workflow_dispatch: {
      inputs: {
        tag: {
          description: "Draft release tag to approve",
          required: true,
          type: "string",
        },
      },
    },
  });
  assert.deepEqual(Object.keys(workflow.jobs), ["approve"]);
  assert.equal(workflow.jobs.approve["runs-on"], "ubuntu-24.04");
  assert.equal(workflow.jobs.approve.environment.name, "release");
  assert.deepEqual(workflow.jobs.approve.permissions, {
    actions: "read",
    contents: "write",
  });
  assert.match(workflow.jobs.approve.if, /refs\/heads\/main/);
  const checkout = workflow.jobs.approve.steps.find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  assert.equal(checkout.with.ref, "${{ inputs.tag }}");
  assert.equal(checkout.with["persist-credentials"], false);

  assert.match(source, /Release tag must use vMAJOR\.MINOR\.PATCH/);
  assert.match(source, /git\/ref\/tags\/\$RELEASE_TAG/);
  assert.match(source, /git\/tags\//);
  assert.match(source, /gh api --paginate --slurp/);
  assert.match(source, /repos\/\$GH_REPO\/releases\?per_page=100/);
  assert.doesNotMatch(source, /releases\/tags\/\$RELEASE_TAG/);
  assert.match(source, /Moodle smoke test: passed on/);
  assert.match(source, /Open edX smoke test: passed on/);
  assert.match(source, /must preserve the complete generated evidence template/);
  assert.match(source, /unexpected release asset/);
  assert.match(source, /SHA256SUMS must name exactly the approved packages/);
  assert.match(source, /sha256sum --check SHA256SUMS/);
  assert.match(source, /release-evidence\.json/);
  assert.match(source, /Required CI evidence does not match the approved Moodle package/);
  assert.match(source, /actions\/runs\/\$source_ci_run_id/);
  assert.match(source, /gh attestation verify/);
  assert.match(source, /--source-digest/);
  assert.match(source, /--source-ref/);
  assert.doesNotMatch(source, /immutable-releases/);
  assert.match(source, /--method PATCH/);
  assert.match(source, /draft=false/);
  assert.match(source, /prerelease=true/);
  assert.doesNotMatch(source, /gh release edit/);
});
