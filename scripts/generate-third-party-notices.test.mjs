import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const SCRIPT_PATH = resolve("scripts/generate-third-party-notices.mjs");

test("generates a deterministic sorted production dependency inventory", (t) => {
  const root = mkdtempSync(join(tmpdir(), "scaffold-third-party-notices-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const input = join(root, "licenses.json");
  const output = join(root, "THIRD_PARTY_NOTICES.md");
  const zPackageV2 = writePackage(root, "z-package-v2", "z-package", "2.0.0", {
    LICENSE: [
      "MIT License",
      "",
      "Copyright (c) Zed Example",
      "",
      "Permission is hereby granted, free of charge.",
      "",
    ].join("\n"),
  });
  const zPackageV1 = writePackage(root, "z-package-v1", "z-package", "1.0.0", {
    LICENSE: "MIT License\nCopyright (c) Zed Example\n",
  });
  const aPackage = writePackage(root, "a-package", "@scope/a-package", "3.0.0", {
    LICENSE: "Apache License Version 2.0\n",
    NOTICE: "A Package includes software developed by Example.\n",
  });
  writeFileSync(
    input,
    JSON.stringify({
      MIT: [
        {
          name: "z-package",
          versions: ["2.0.0", "1.0.0"],
          homepage: "https://example.com/z",
          paths: [zPackageV2, zPackageV1],
        },
      ],
      "Apache-2.0": [
        {
          name: "@scope/a-package",
          versions: ["3.0.0"],
          homepage: "https://example.com/a",
          paths: [aPackage],
        },
      ],
    }),
  );

  const result = runGenerator(["--input", input, "--output", output]);

  assert.equal(result.status, 0, result.stderr);
  const notices = readFileSync(output, "utf8");
  assert.match(notices, /^# Third-Party Notices$/m);
  assert.match(notices, /\| @scope\/a-package\s+\| 3\.0\.0\s+\| Apache-2\.0\s+\|/);
  assert.match(notices, /\| z-package\s+\| 1\.0\.0\s+\| MIT\s+\|/);
  assert.ok(notices.indexOf("@scope/a-package") < notices.indexOf("z-package"));
  assert.ok(notices.indexOf("1.0.0") < notices.indexOf("2.0.0"));
  assert.match(notices, /## Licence and notice texts/);
  assert.match(notices, /Copyright \(c\) Zed Example/);
  assert.match(notices, /Permission is hereby granted, free of charge\./);
  assert.match(notices, /A Package includes software developed by Example\./);

  const check = runGenerator(["--input", input, "--output", output, "--check"]);
  assert.equal(check.status, 0, check.stderr);
});

test("check mode rejects a stale notice inventory", (t) => {
  const root = mkdtempSync(join(tmpdir(), "scaffold-third-party-notices-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const input = join(root, "licenses.json");
  const output = join(root, "THIRD_PARTY_NOTICES.md");
  writeFileSync(input, JSON.stringify({ MIT: [] }));
  writeFileSync(output, "stale\n");

  const result = runGenerator(["--input", input, "--output", output, "--check"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /THIRD_PARTY_NOTICES\.md is stale/);
});

test("normalizes platform-specific Canvas binary packages", (t) => {
  const root = mkdtempSync(join(tmpdir(), "scaffold-third-party-notices-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const darwinInput = join(root, "licenses-darwin.json");
  const linuxInput = join(root, "licenses-linux.json");
  const darwinOutput = join(root, "THIRD_PARTY_NOTICES-darwin.md");
  const linuxOutput = join(root, "THIRD_PARTY_NOTICES-linux.md");
  const canvasPackage = writePackage(root, "canvas", "@napi-rs/canvas", "0.1.100", {
    LICENSE: "MIT License\nCopyright (c) Canvas Example\n",
  });
  const canvas = {
    name: "@napi-rs/canvas",
    versions: ["0.1.100"],
    paths: [canvasPackage],
    homepage: "https://github.com/Brooooooklyn/canvas#readme",
  };
  const inventory = (platformPackage) => ({
    MIT: [
      canvas,
      {
        ...canvas,
        name: platformPackage,
        paths: [],
      },
    ],
  });
  writeFileSync(darwinInput, JSON.stringify(inventory("@napi-rs/canvas-darwin-arm64")));
  writeFileSync(linuxInput, JSON.stringify(inventory("@napi-rs/canvas-linux-x64-gnu")));

  const darwinResult = runGenerator(["--input", darwinInput, "--output", darwinOutput]);
  const linuxResult = runGenerator(["--input", linuxInput, "--output", linuxOutput]);

  assert.equal(darwinResult.status, 0, darwinResult.stderr);
  assert.equal(linuxResult.status, 0, linuxResult.stderr);
  const notices = readFileSync(darwinOutput, "utf8");
  assert.equal(notices, readFileSync(linuxOutput, "utf8"));
  assert.match(notices, /\| @napi-rs\/canvas\s+\| 0\.1\.100\s+\| MIT\s+\|/);
  assert.doesNotMatch(notices, /@napi-rs\/canvas-(?:darwin|linux)-/);
});

function runGenerator(arguments_) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...arguments_], {
    encoding: "utf8",
  });
}

function writePackage(root, directory, name, version, files) {
  const packageRoot = join(root, directory);
  mkdirSync(packageRoot);
  writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name, version }));
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(packageRoot, name), contents);
  }
  return packageRoot;
}
