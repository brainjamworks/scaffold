import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parse as parseYaml } from "yaml";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_PATH = resolve(REPOSITORY_ROOT, ".github/workflows/ci.yml");

function loadWorkflow() {
  const source = readFileSync(WORKFLOW_PATH, "utf8");
  return { source, workflow: parseYaml(source) };
}

function moodleJob(workflow) {
  const job = workflow.jobs["moodle-phpunit"];
  assert.ok(job, "CI must define the native Moodle PHPUnit job");
  return job;
}

function xblockRuntimeJob(workflow) {
  const job = workflow.jobs["xblock-runtime"];
  assert.ok(job, "CI must define the XBlock runtime compatibility job");
  return job;
}

function actionReferences(workflow) {
  return Object.values(workflow.jobs).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => (step.uses ? [step.uses] : [])),
  );
}

test("packaged and release Markdown runs both code and documentation CI", (t) => {
  const { workflow } = loadWorkflow();
  const classify = workflow.jobs.classify.steps.find(
    (step) => step.name === "Classify changed paths",
  );
  assert.ok(classify?.run);

  const root = mkdtempSync(join(tmpdir(), "scaffold-ci-classify-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const mockGit = join(bin, "git");
  writeFileSync(
    mockGit,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "cat-file" ]]; then
  exit 0
fi
if [[ "$1" == "diff" ]]; then
  printf '%s\\0' "$CHANGED_FILE"
  exit 0
fi
echo "unexpected git invocation: $*" >&2
exit 1
`,
  );
  chmodSync(mockGit, 0o755);

  const releaseFiles = [
    "CHANGELOG.md",
    "THIRD_PARTY_NOTICES.md",
    "adapters/moodle/scaffold/CHANGES.md",
    "adapters/moodle/scaffold/README.md",
    "adapters/moodle/scaffold/THIRD_PARTY_NOTICES.md",
    "adapters/xblock/CHANGES.md",
    "adapters/xblock/README.md",
    "adapters/xblock/scaffold_xblock/runtime-notice.md",
  ];
  for (const changedFile of releaseFiles) {
    const output = join(root, changedFile.replaceAll("/", "-"));
    const result = spawnSync("bash", ["-c", classify.run], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        BEFORE_SHA: "a".repeat(40),
        CHANGED_FILE: changedFile,
        EVENT_NAME: "push",
        GITHUB_OUTPUT: output,
        HEAD_SHA: "b".repeat(40),
        PATH: `${bin}:${process.env.PATH}`,
        PULL_REQUEST_BASE_SHA: "",
      },
    });

    assert.equal(result.status, 0, `${changedFile}: ${result.stderr}`);
    assert.equal(readFileSync(output, "utf8"), "code=true\ndocs=true\n", changedFile);
  }
});

test("CI defines exactly the selected Moodle compatibility pair", () => {
  const { workflow } = loadWorkflow();
  const job = moodleJob(workflow);

  assert.deepEqual(job.needs, ["classify", "build"]);
  assert.equal(job.if, "${{ needs.classify.outputs.code == 'true' }}");
  assert.equal(job.strategy["fail-fast"], false);
  assert.deepEqual(job.strategy.matrix.include, [
    {
      moodle: "MOODLE_405_STABLE",
      php: "8.1",
      database: "mysqli",
      "database-image": "mysql:8.0",
      "database-port": 3306,
      "database-health-command": "mysqladmin ping -h localhost -uroot -pmoodle",
      "database-user": "root",
      "php-extension": "mysqli",
    },
    {
      moodle: "MOODLE_502_STABLE",
      php: "8.3",
      database: "pgsql",
      "database-image": "postgres:16",
      "database-port": 5432,
      "database-health-command": "pg_isready -U moodle -d postgres",
      "database-user": "moodle",
      "php-extension": "pgsql",
    },
  ]);
});

test("CI verifies the supported XBlock runtime boundaries", () => {
  const { workflow } = loadWorkflow();
  const job = xblockRuntimeJob(workflow);

  assert.deepEqual(job.needs, ["classify"]);
  assert.equal(job.if, "${{ needs.classify.outputs.code == 'true' }}");
  assert.equal(job.strategy["fail-fast"], false);
  assert.deepEqual(job.strategy.matrix.include, [
    {
      python: "3.11",
      xblock: "5.2.0",
      host: "Open edX Ulmo",
    },
    {
      python: "3.12",
      xblock: "6.3.1",
      host: "XBlock 6 boundary",
    },
  ]);

  const setupPython = job.steps.find((step) => step.uses?.startsWith("actions/setup-python@"));
  const install = job.steps.find((step) => step.name === "Install XBlock runtime boundary");
  const testRuntime = job.steps.find((step) => step.name === "Test Scaffold XBlock runtime");
  const loadEntryPoint = job.steps.find(
    (step) => step.name === "Install and load Scaffold entry point",
  );

  assert.equal(setupPython.uses, "actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1");
  assert.equal(setupPython.with["python-version"], "${{ matrix.python }}");
  assert.match(install.run, /XBlock==\$\{\{ matrix\.xblock \}\}/);
  assert.match(testRuntime.run, /test_assessment_contracts/);
  assert.doesNotMatch(testRuntime.run, /test_package/);
  assert.match(loadEntryPoint.run, /pip install --no-deps \.\/adapters\/xblock/);
  assert.match(loadEntryPoint.run, /entry_points/);
  assert.match(loadEntryPoint.run, /scaffold/);
  assert.ok(workflow.jobs.status.needs.includes("xblock-runtime"));
});

test("each Moodle row starts only its selected database service", () => {
  const { workflow } = loadWorkflow();
  const job = moodleJob(workflow);

  assert.deepEqual(Object.keys(job.services), ["database"]);
  assert.equal(job.services.database.image, "${{ matrix.database-image }}");
  assert.deepEqual(job.services.database.ports, [
    "${{ matrix.database-port }}:${{ matrix.database-port }}",
  ]);
  assert.match(job.services.database.options, /matrix\.database-health-command/);
  assert.deepEqual(job.services.database.env, {
    MYSQL_ROOT_PASSWORD: "moodle",
    POSTGRES_DB: "postgres",
    POSTGRES_USER: "moodle",
    POSTGRES_PASSWORD: "moodle",
  });

  const setupPhp = job.steps.find((step) => step.uses?.startsWith("shivammathur/setup-php@"));
  assert.equal(setupPhp.with["php-version"], "${{ matrix.php }}");
  assert.match(setupPhp.with.extensions, /\$\{\{ matrix\.php-extension \}\}/);
  assert.equal(setupPhp.with.coverage, "none");
});

test("Moodle Plugin CI installs the packaged candidate and runs the component suite", () => {
  const { source, workflow } = loadWorkflow();
  const buildJob = workflow.jobs.build;
  const job = moodleJob(workflow);
  const buildStepNames = buildJob.steps.map((step) => step.name);
  const stepNames = job.steps.map((step) => step.name);
  const packageIndex = buildStepNames.indexOf("Package Moodle plugin candidate");
  const uploadIndex = buildStepNames.indexOf("Upload Moodle plugin candidate");
  const downloadIndex = stepNames.indexOf("Download Moodle plugin candidate");
  const restoreIndex = stepNames.indexOf("Restore Moodle plugin candidate");
  const prepareIndex = stepNames.indexOf("Prepare Moodle workspace");
  const installIndex = stepNames.indexOf("Install Moodle");
  const packageCandidate = buildJob.steps.find(
    (step) => step.name === "Package Moodle plugin candidate",
  );
  const uploadCandidate = buildJob.steps.find(
    (step) => step.name === "Upload Moodle plugin candidate",
  );
  const downloadCandidate = job.steps.find(
    (step) => step.name === "Download Moodle plugin candidate",
  );
  const restoreCandidate = job.steps.find(
    (step) => step.name === "Restore Moodle plugin candidate",
  );
  const installTool = job.steps.find((step) => step.name === "Install Moodle Plugin CI");
  const prepareWorkspace = job.steps.find((step) => step.name === "Prepare Moodle workspace");
  const installMoodle = job.steps.find((step) => step.name === "Install Moodle");
  const runPhpunit = job.steps.find((step) => step.name === "Run Moodle component suite");

  assert.ok(packageIndex >= 0, "Build job must package the Moodle plugin candidate");
  assert.ok(uploadIndex > packageIndex, "Build job must upload the packaged candidate");
  assert.ok(downloadIndex >= 0, "Moodle job must download the packaged candidate");
  assert.ok(restoreIndex > downloadIndex, "Moodle job must restore the downloaded candidate");
  assert.ok(
    prepareIndex > restoreIndex,
    "Moodle workspace must be prepared after candidate restore",
  );
  assert.ok(installIndex > prepareIndex, "Moodle must install after workspace preparation");
  assert.equal(packageCandidate.run, "python3 adapters/moodle/scripts/package.py");
  assert.equal(uploadCandidate.with.name, "moodle-plugin-candidate");
  assert.match(uploadCandidate.with.path, /mod_scaffold-\*\.zip/);
  assert.match(uploadCandidate.with.path, /mod_scaffold-\*\.zip\.sha256/);
  assert.equal(downloadCandidate.with.name, "moodle-plugin-candidate");
  assert.match(restoreCandidate.run, /sha256sum --check/);
  assert.match(restoreCandidate.run, /MOODLE_PLUGIN_PATH=\$pluginpath/);
  assert.equal(prepareWorkspace.run, 'mkdir -p "${{ runner.temp }}/moodle-plugin-ci-work"');
  assert.equal(installMoodle["working-directory"], "${{ runner.temp }}/moodle-plugin-ci-work");
  assert.equal(runPhpunit["working-directory"], "${{ runner.temp }}/moodle-plugin-ci-work");

  const jobSource = source.slice(
    source.indexOf("  moodle-phpunit:"),
    source.indexOf("\n  status:", source.indexOf("  moodle-phpunit:")),
  );
  assert.match(
    installTool.run,
    /composer create-project.*moodlehq\/moodle-plugin-ci.*['"]?\^4['"]?/,
  );
  assert.match(
    installMoodle.run,
    /moodle-plugin-ci install --plugin "\$MOODLE_PLUGIN_PATH" .*--no-plugin-node/,
  );
  assert.match(
    runPhpunit.run,
    /moodle-plugin-ci phpunit --testsuite mod_scaffold_testsuite --fail-on-warning --fail-on-risky/,
  );
  assert.doesNotMatch(jobSource, /--coverage/i);
});

test("Moodle Plugin CI runs the applicable static checks once on the current PostgreSQL leg", () => {
  const { workflow } = loadWorkflow();
  const job = moodleJob(workflow);
  const workingDirectory = "${{ runner.temp }}/moodle-plugin-ci-work";
  const currentPostgresOnly =
    "${{ !cancelled() && matrix.moodle == 'MOODLE_502_STABLE' && matrix.database == 'pgsql' }}";
  const expectedChecks = new Map([
    ["Run Moodle PHP lint", "moodle-plugin-ci phplint"],
    ["Run Moodle code checker", "moodle-plugin-ci phpcs --max-warnings 0"],
    ["Run Moodle PHPDoc checker", "moodle-plugin-ci phpdoc --max-warnings 0"],
    ["Run Moodle plugin validation", "moodle-plugin-ci validate"],
    ["Run Moodle upgrade savepoint validation", "moodle-plugin-ci savepoints"],
    ["Run Moodle Grunt checks", "moodle-plugin-ci grunt --max-lint-warnings 0"],
  ]);

  for (const [name, command] of expectedChecks) {
    const step = job.steps.find((candidate) => candidate.name === name);
    assert.ok(step, `${name} step is required`);
    assert.equal(step.if, currentPostgresOnly);
    assert.equal(step["working-directory"], workingDirectory);
    assert.equal(step.run, command);
  }
});

test("native Moodle PHPUnit is part of read-only Required CI with pinned actions", () => {
  const { source, workflow } = loadWorkflow();

  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.ok(workflow.jobs.status.needs.includes("moodle-phpunit"));

  for (const reference of actionReferences(workflow)) {
    assert.match(reference, /@[0-9a-f]{40}$/, reference);
  }
  assert.match(source, /shivammathur\/setup-php@b604ade2a87db23f8871b7182e69ec5e75effb45\s+# v2/);
});
