import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("keeps Moodle Grunt as the sole owner of AMD deployment artifacts", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts["build:amd"], undefined);
  assert.equal(manifest.scripts["build:unchecked"], "vp build");
  assert.match(manifest.scripts["test:unchecked"], /tests\/moodle-amd\.node\.mjs/);

  for (const dependency of [
    "@babel/core",
    "@babel/preset-env",
    "babel-plugin-system-import-transformer",
    "babel-plugin-transform-es2015-modules-amd-lazy",
    "terser",
  ]) {
    assert.equal(manifest.devDependencies[dependency], undefined);
  }

  await assert.rejects(access(new URL("../scripts/build-amd.mjs", import.meta.url)), {
    code: "ENOENT",
  });
});

test("tracks Moodle Grunt's AMD deployment module and source map", async () => {
  const deployment = await readFile(
    new URL("../scaffold/amd/build/bootstrap.min.js", import.meta.url),
    "utf8",
  );
  const sourceMap = JSON.parse(
    await readFile(new URL("../scaffold/amd/build/bootstrap.min.js.map", import.meta.url), "utf8"),
  );

  assert.match(deployment, /\/\/# sourceMappingURL=bootstrap\.min\.js\.map\s*$/);
  assert.equal(sourceMap.version, 3);
  assert.equal(sourceMap.file, "bootstrap.min.js");
  assert.deepEqual(sourceMap.sources, ["../src/bootstrap.js"]);
});
