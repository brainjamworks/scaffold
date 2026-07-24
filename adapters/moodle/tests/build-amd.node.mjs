import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildAmdModules } from "../scripts/build-amd.mjs";

test("runs AMD generation in the normal Moodle build", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts["build:amd"], "node scripts/build-amd.mjs");
  assert.equal(manifest.scripts["build:unchecked"], "vp build && vp run build:amd");
});

test("runs the AMD builder regression test in the normal Moodle test suite", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(manifest.scripts["test:unchecked"], /node --test tests\/build-amd\.node\.mjs/);
});

test("builds a named Moodle AMD deployment module from a clean source tree", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "scaffold-moodle-amd-"));
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));

  const sourceRoot = join(temporaryRoot, "amd", "src");
  const outputRoot = join(temporaryRoot, "amd", "build");
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(
    join(sourceRoot, "bootstrap.js"),
    ['import Ajax from "core/ajax";', "", "export const init = () => Ajax.call([]);", ""].join(
      "\n",
    ),
  );

  await buildAmdModules({ component: "mod_scaffold", outputRoot, sourceRoot });

  const outputPath = join(outputRoot, "bootstrap.min.js");
  const firstOutput = await readFile(outputPath, "utf8");
  assert.match(firstOutput, /define\("mod_scaffold\/bootstrap"/);
  assert.match(firstOutput, /"core\/ajax"/);
  assert.doesNotMatch(firstOutput, /\b(?:import|export)\b/);
  assert.doesNotMatch(firstOutput, /sourceMappingURL/);

  await buildAmdModules({ component: "mod_scaffold", outputRoot, sourceRoot });
  assert.equal(await readFile(outputPath, "utf8"), firstOutput);
});
