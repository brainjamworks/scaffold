import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readAdapterFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readRepositoryFile = (path) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");

test("provides Moodle's canonical branded activity icon", async () => {
  const icon = await readAdapterFile("scaffold/pix/monologo.svg");

  assert.match(icon, /viewBox="0 0 64 64"/);
  assert.equal(icon.match(/stroke="currentColor"/g)?.length, 2);
  assert.doesNotMatch(icon, /#00BA92|#F43A57/);
});

test("keeps artifact checks in the adapter build, test, and verification commands", async () => {
  const manifest = JSON.parse(await readAdapterFile("package.json"));

  assert.match(manifest.scripts.build, /^vp run check:artifacts /);
  assert.match(manifest.scripts.test, /^vp run check:artifacts /);
  assert.match(manifest.scripts.verify, /^vp run check:artifacts /);
  assert.equal(
    manifest.scripts["check:artifacts"],
    "node scripts/sync-assessment-artifacts.mjs --check && " +
      "node scripts/sync-learner-activity-artifact.mjs --check && " +
      "node scripts/sync-third-party-libraries.mjs --check",
  );
  assert.equal(
    manifest.scripts["sync:third-party-libraries"],
    "node scripts/sync-third-party-libraries.mjs --write",
  );
});

test("wires an authorized Moodle File API lookup to the standard send path", async () => {
  const source = await readAdapterFile("scaffold/lib.php");
  const callbackStart = source.indexOf("function mod_scaffold_pluginfile(");
  const callbackEnd = source.indexOf("function scaffold_normalize_grade(", callbackStart);
  const callback = source.slice(callbackStart, callbackEnd);

  assert.ok(callbackStart >= 0, "mod_scaffold_pluginfile callback must exist");
  assert.ok(callbackEnd > callbackStart, "pluginfile callback boundary must exist");
  assert.match(
    callback,
    /\$fs->get_file\(\$context->id, 'mod_scaffold', \$filearea, \(int\) \$scaffoldid, \$filepath, \$filename\)/,
  );
  assert.match(callback, /send_stored_file\(\$file, DAYSECS, 0, \$forcedownload, \$options\);/);
});

test("does not retain or invoke the standalone PHP test harness", async () => {
  const testfiles = await readdir(new URL(".", import.meta.url));
  const manifest = JSON.parse(await readAdapterFile("package.json"));
  const protocoltest = await readAdapterFile("frontend/src/bridge/protocol.test.ts");

  assert.deepEqual(
    testfiles.filter((filename) => filename.endsWith(".php")),
    [],
  );
  assert.doesNotMatch(manifest.scripts["test:unchecked"], /\bphp\s+tests\//);
  assert.doesNotMatch(protocoltest, /external_method_parity_test\.php|execFileSync/);
});

test("runs the packaged plugin through Moodle's developer-debug Behat smoke gate", async () => {
  const feature = await readAdapterFile("scaffold/tests/behat/developer_debug_smoke.feature");
  const generator = await readAdapterFile("scaffold/tests/generator/lib.php");
  const workflow = await readRepositoryFile(".github/workflows/ci.yml");

  assert.match(feature, /@mod\b/);
  assert.match(feature, /@mod_scaffold\b/);
  assert.match(feature, /@mod_scaffold_smoke\b/);
  assert.match(feature, /@javascript\b/);
  assert.match(feature, /\| scaffold\s+\| C1\s+\| Scaffold smoke test\s+\|/);
  assert.match(feature, /I switch to "sc-moodle-isolated-frame" class iframe/);
  assert.match(feature, /I should see "Back to activity"/);
  assert.match(generator, /class mod_scaffold_generator extends testing_module_generator/);

  assert.match(workflow, /python3 adapters\/moodle\/scripts\/package\.py/);
  assert.match(workflow, /name: moodle-plugin-candidate/);
  assert.match(workflow, /Confirm Moodle developer debugging/);
  assert.match(workflow, /moodle-plugin-ci behat[\s\S]*--profile chrome/);
  assert.match(workflow, /--tags=@mod_scaffold_smoke/);
  assert.match(workflow, /--start-servers/);
  assert.match(workflow, /Upload Behat faildump/);
});

test("routes Core xAPI templates through Moodle core_xapi without adding an LRS", async () => {
  const services = await readAdapterFile("scaffold/db/services.php");
  const endpoint = await readAdapterFile(
    "scaffold/classes/external/accept_xapi_statement.php",
  );
  const handler = await readAdapterFile("scaffold/classes/xapi/handler.php");
  const event = await readAdapterFile("scaffold/classes/event/statement_received.php");

  assert.match(services, /'mod_scaffold_accept_xapi_statement'/);
  assert.match(endpoint, /item_agent::create_from_user\(\$USER\)/);
  assert.match(endpoint, /strlen\(\$params\['statementjson'\]\) > 65536/);
  assert.match(endpoint, /handler::create\('mod_scaffold'\)/);
  assert.match(endpoint, /process_statements\(\[\$statement\]\)/);
  assert.match(handler, /class handler extends handler_base/);
  assert.match(handler, /statement_to_event\(statement \$statement\)/);
  assert.match(handler, /statement_received::create\(\$params\)/);
  assert.match(event, /class statement_received extends \\core\\event\\base/);
  assert.doesNotMatch(endpoint + handler + event, /\bLRS\b|learning record store/i);
});
