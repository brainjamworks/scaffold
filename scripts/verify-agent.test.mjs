import assert from "node:assert/strict";
import test from "node:test";

import { evaluateScope, parseArguments } from "./verify-agent.mjs";

test("parseArguments accepts repeated allow paths and named checks", () => {
  assert.deepEqual(
    parseArguments([
      "--",
      "--allow",
      "packages/core/src/editor",
      "--allow",
      "scripts/verify-agent.mjs",
      "--check",
      "architecture",
      "--check",
      "static",
    ]),
    {
      allow: ["packages/core/src/editor", "scripts/verify-agent.mjs"],
      base: "HEAD",
      checks: ["architecture", "static"],
      json: false,
    },
  );
});

test("parseArguments rejects full-suite checks", () => {
  for (const check of ["unit", "release"]) {
    assert.throws(() => parseArguments(["--check", check]), /Unknown check/);
  }
});

test("evaluateScope accepts exact files and descendants of allowed directories", () => {
  assert.deepEqual(
    evaluateScope(
      [
        "packages/core/src/editor/commands.ts",
        "scripts/verify-agent.mjs",
        "scripts/verify-agent.test.mjs",
      ],
      ["packages/core/src/editor", "scripts/verify-agent.mjs", "scripts/verify-agent.test.mjs"],
    ),
    { status: "PASS", outsideScope: [] },
  );
});

test("evaluateScope reports files outside the agreed scope", () => {
  assert.deepEqual(
    evaluateScope(
      ["packages/core/src/editor/commands.ts", "vite.config.ts"],
      ["packages/core/src/editor"],
    ),
    { status: "FAIL", outsideScope: ["vite.config.ts"] },
  );
});
