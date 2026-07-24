import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readAdapterFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

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
      "node scripts/sync-learner-activity-artifact.mjs --check",
  );
});

test("wires an authorized Moodle File API lookup to the standard send path", async () => {
  const source = await readAdapterFile("scaffold/lib.php");
  const callback = source.match(
    /function mod_scaffold_pluginfile\([\s\S]*?\n}\n\nfunction scaffold_normalize_grade/,
  )?.[0];

  assert.ok(callback, "mod_scaffold_pluginfile callback must exist");
  assert.match(
    callback,
    /\$fs->get_file\(\$context->id, 'mod_scaffold', \$filearea, \(int\) \$scaffoldid, \$filepath, \$filename\)/,
  );
  assert.match(callback, /send_stored_file\(\$file, DAYSECS, 0, \$forcedownload, \$options\);/);
});
