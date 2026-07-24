import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const SCRIPT_PATH = resolve("scripts/generate-third-party-notices.mjs");

test("generates a deterministic sorted production dependency inventory", (t) => {
  const root = mkdtempSync(join(tmpdir(), "scaffold-third-party-notices-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const input = join(root, "licenses.json");
  const output = join(root, "THIRD_PARTY_NOTICES.md");
  writeFileSync(
    input,
    JSON.stringify({
      MIT: [
        {
          name: "z-package",
          versions: ["2.0.0", "1.0.0"],
          homepage: "https://example.com/z",
        },
      ],
      "Apache-2.0": [
        {
          name: "@scope/a-package",
          versions: ["3.0.0"],
          homepage: "https://example.com/a",
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

function runGenerator(arguments_) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...arguments_], {
    encoding: "utf8",
  });
}
