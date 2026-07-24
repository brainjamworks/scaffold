import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

function actionReferences(workflow) {
  return Object.values(workflow.jobs).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => (step.uses ? [step.uses] : [])),
  );
}

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
      "database-health-command": "mysqladmin ping -h localhost -umoodle -pmoodle",
      "php-extension": "mysqli",
    },
    {
      moodle: "MOODLE_502_STABLE",
      php: "8.3",
      database: "pgsql",
      "database-image": "postgres:16",
      "database-port": 5432,
      "database-health-command": "pg_isready -U moodle -d moodle",
      "php-extension": "pgsql",
    },
  ]);
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

  const setupPhp = job.steps.find((step) => step.uses?.startsWith("shivammathur/setup-php@"));
  assert.equal(setupPhp.with["php-version"], "${{ matrix.php }}");
  assert.match(setupPhp.with.extensions, /\$\{\{ matrix\.php-extension \}\}/);
  assert.equal(setupPhp.with.coverage, "none");
});

test("Moodle Plugin CI builds, installs, and runs only the component suite", () => {
  const { source, workflow } = loadWorkflow();
  const job = moodleJob(workflow);
  const stepNames = job.steps.map((step) => step.name);
  const buildIndex = stepNames.indexOf("Build Moodle plugin");
  const installIndex = stepNames.indexOf("Install Moodle");
  const installTool = job.steps.find((step) => step.name === "Install Moodle Plugin CI");
  const installMoodle = job.steps.find((step) => step.name === "Install Moodle");
  const runPhpunit = job.steps.find((step) => step.name === "Run Moodle component suite");

  assert.ok(buildIndex >= 0, "Moodle plugin build step is required");
  assert.ok(installIndex > buildIndex, "Moodle plugin must be built before Moodle installation");

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
    /moodle-plugin-ci install --plugin \.\/adapters\/moodle\/scaffold .*--no-plugin-node/,
  );
  assert.match(
    runPhpunit.run,
    /moodle-plugin-ci phpunit --testsuite mod_scaffold_testsuite --fail-on-warning --fail-on-risky/,
  );
  assert.doesNotMatch(jobSource, /moodle-plugin-ci behat|selenium|--coverage/i);
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
