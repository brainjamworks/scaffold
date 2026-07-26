import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = resolve(REPOSITORY_ROOT, "scripts/prepare-release-candidate.mjs");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

test("prepares coordinated release metadata and notes", (t) => {
  const fixture = createReleaseFixture(t);
  const result = runPrepare(fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(join(fixture, "github-output"), "utf8"),
    "version=0.1.0\nrelease_title=Scaffold 0.1.0\n",
  );

  const notes = readFileSync(join(fixture, "release-notes.md"), "utf8");
  assert.match(notes, /^Scaffold 0\.1\.0 is an alpha prerelease\./);
  assert.match(notes, /Shared release change\./);
  assert.match(notes, /Moodle release change\./);
  assert.match(notes, /XBlock release change\./);
  assert.match(notes, new RegExp(`Source commit: \`${COMMIT}\``));
  assert.match(notes, /Required CI: exact run and Moodle digest in `release-evidence\.json`/);
  assert.match(notes, /Checksums: SHA256SUMS verified/);
  assert.match(notes, /Provenance: GitHub artifact attestations attached/);
  assert.match(notes, /Moodle smoke test: pending/);
  assert.match(notes, /Open edX smoke test: pending/);
  assert.match(notes, /Moodle smoke test: passed on <host version and result>/);
  assert.match(notes, /Open edX smoke test: passed on <host version and result>/);
});

test("rejects unknown command arguments", (t) => {
  const fixture = createReleaseFixture(t);
  const result = runPrepare(fixture, { extraArguments: ["--publish", "true"] });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown argument: --publish/);
});

test("rejects duplicate command arguments", (t) => {
  const fixture = createReleaseFixture(t);
  const result = runPrepare(fixture, {
    extraArguments: ["--tag", "v0.1.0"],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Duplicate argument: --tag/);
});

test("rejects a non-release tag", (t) => {
  const fixture = createReleaseFixture(t);
  const result = runPrepare(fixture, { tag: "release-0.1.0" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Release tag must use vMAJOR\.MINOR\.PATCH/);
});

test("rejects a malformed release commit", (t) => {
  const fixture = createReleaseFixture(t);
  const result = runPrepare(fixture, { commit: "main" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /40-character lowercase Git SHA/);
});

test("rejects a root product version that differs from the tag", (t) => {
  const fixture = createReleaseFixture(t);
  writeFixture(fixture, "package.json", '{"version":"0.2.0"}\n');

  const result = runPrepare(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /root product version 0\.2\.0 does not match release tag v0\.1\.0/);
});

test("rejects a Moodle version that differs from the tag", (t) => {
  const fixture = createReleaseFixture(t);
  writeFixture(
    fixture,
    "adapters/moodle/scaffold/version.php",
    [
      "<?php",
      "$plugin->component = 'mod_scaffold';",
      "$plugin->version = 2026072400;",
      "$plugin->release = '0.2.0';",
      "",
    ].join("\n"),
  );

  const result = runPrepare(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Moodle version 0\.2\.0 does not match release tag v0\.1\.0/);
});

test("rejects an XBlock version that differs from the tag", (t) => {
  const fixture = createReleaseFixture(t);
  writeFixture(
    fixture,
    "adapters/xblock/pyproject.toml",
    ["[project]", 'name = "scaffold-xblock"', 'version = "0.2.0"', ""].join("\n"),
  );

  const result = runPrepare(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /XBlock version 0\.2\.0 does not match release tag v0\.1\.0/);
});

test("requires the coordinated version in every changelog", (t) => {
  const fixture = createReleaseFixture(t);
  writeFixture(fixture, "adapters/xblock/CHANGES.md", "# XBlock changelog\n\n## Unreleased\n");

  const result = runPrepare(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /XBlock CHANGES\.md must contain a dated 0\.1\.0 release heading/);
});

function createReleaseFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "scaffold-release-candidate-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  writeFixture(root, "package.json", '{"version":"0.1.0"}\n');
  writeFixture(
    root,
    "CHANGELOG.md",
    [
      "# Changelog",
      "",
      "## Unreleased",
      "",
      "## 0.1.0 - 2026-07-24",
      "",
      "### Added",
      "",
      "- Shared release change.",
      "",
    ].join("\n"),
  );
  writeFixture(
    root,
    "adapters/moodle/scaffold/version.php",
    [
      "<?php",
      "$plugin->component = 'mod_scaffold';",
      "$plugin->version = 2026072400;",
      "$plugin->release = '0.1.0';",
      "",
    ].join("\n"),
  );
  writeFixture(
    root,
    "adapters/moodle/scaffold/CHANGES.md",
    [
      "# Moodle changelog",
      "",
      "## Unreleased",
      "",
      "## 0.1.0 - 2026-07-24",
      "",
      "- Moodle release change.",
      "",
    ].join("\n"),
  );
  writeFixture(
    root,
    "adapters/xblock/pyproject.toml",
    ["[project]", 'name = "scaffold-xblock"', 'version = "0.1.0"', ""].join("\n"),
  );
  writeFixture(
    root,
    "adapters/xblock/CHANGES.md",
    [
      "# XBlock changelog",
      "",
      "## Unreleased",
      "",
      "## 0.1.0 - 2026-07-24",
      "",
      "- XBlock release change.",
      "",
    ].join("\n"),
  );
  return root;
}

function runPrepare(repositoryRoot, overrides = {}) {
  return spawnSync(
    process.execPath,
    [
      SCRIPT_PATH,
      "--repository-root",
      repositoryRoot,
      "--tag",
      overrides.tag ?? "v0.1.0",
      "--commit",
      overrides.commit ?? COMMIT,
      "--notes-output",
      join(repositoryRoot, "release-notes.md"),
      "--github-output",
      join(repositoryRoot, "github-output"),
      ...(overrides.extraArguments ?? []),
    ],
    { encoding: "utf8" },
  );
}

function writeFixture(root, relativePath, contents) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}
