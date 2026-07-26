import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  collectBundledLibraries,
  renderThirdPartyLibraries,
  renderThirdPartyNotices,
} from "../scripts/sync-third-party-libraries.mjs";

const adapterRoot = new URL("..", import.meta.url);
const pluginRoot = new URL("../scaffold/", import.meta.url);

test("keeps Moodle third-party metadata equal to the generated frontend bundle", async () => {
  const libraries = await collectBundledLibraries();
  const xml = await readFile(new URL("thirdpartylibs.xml", pluginRoot), "utf8");
  const notices = await readFile(new URL("THIRD_PARTY_NOTICES.md", pluginRoot), "utf8");

  assert.ok(libraries.length > 100, "expected the complete tree-shaken frontend inventory");
  assert.ok(libraries.some(({ name }) => name === "@fontsource/poppins"));
  assert.ok(libraries.some(({ name }) => name === "@fontsource-variable/jetbrains-mono"));
  assert.ok(libraries.some(({ name }) => name === "katex"));
  assert.ok(libraries.some(({ name }) => name === "react"));
  for (const cssPackage of [
    "@fontsource-variable/jetbrains-mono",
    "@fontsource/poppins",
    "katex",
    "mathlive",
    "react-pdf",
  ]) {
    assert.ok(
      libraries.some(({ location, name }) => name === cssPackage && location === "public"),
      `${cssPackage} must include its compiled root stylesheet location`,
    );
  }
  assert.ok(libraries.every(({ name }) => !name.startsWith("@scaffold/")));
  assert.ok(
    libraries.every(({ repository }) => /^https?:\/\//.test(repository)),
    "every upstream source must be an absolute HTTP URL",
  );
  assert.equal(xml, renderThirdPartyLibraries(libraries));
  assert.equal(notices, renderThirdPartyNotices(libraries));
  assert.match(notices, /## Licence and notice texts/);
  assert.match(notices, /Copyright \(c\) Meta Platforms, Inc\. and affiliates\./);
  assert.match(
    notices,
    /The above copyright notice and this permission notice shall be included in all/,
  );
  assert.match(notices, /Apache ECharts\nCopyright 2017-\d{4} The Apache Software Foundation/);

  for (const { location, outputFiles } of libraries) {
    assert.ok(
      outputFiles.every((outputFile) => outputFile.startsWith(`${location}/`)),
      `${location} must contain every generated package contribution`,
    );
  }
});

test("documents Moodle's import and update procedure for the generated bundle", async () => {
  const readme = await readFile(new URL("scaffold/readme_moodle.txt", adapterRoot), "utf8");

  assert.match(readme, /pnpm-lock\.yaml/);
  assert.match(readme, /sync:third-party-libraries/);
  assert.match(readme, /thirdpartylibs\.xml/);
  assert.match(readme, /THIRD_PARTY_NOTICES\.md/);
});
