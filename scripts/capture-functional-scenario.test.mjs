import assert from "node:assert/strict";
import test from "node:test";

import {
  createArtifactPaths,
  parseCaptureArguments,
  validateScenario,
} from "./capture-functional-scenario.mjs";

test("parseCaptureArguments accepts one scenario under .qa/scenarios", () => {
  assert.deepEqual(parseCaptureArguments(["--scenario", ".qa/scenarios/authoring-smoke.json"]), {
    scenarioPath: ".qa/scenarios/authoring-smoke.json",
  });
});

test("parseCaptureArguments accepts Vite+'s forwarded separator", () => {
  assert.deepEqual(parseCaptureArguments(["--", "--scenario", ".qa/scenarios/authoring-smoke.json"]), {
    scenarioPath: ".qa/scenarios/authoring-smoke.json",
  });
});

test("parseCaptureArguments rejects scenario paths outside .qa/scenarios", () => {
  assert.throws(
    () => parseCaptureArguments(["--scenario", "../other-project/flow.json"]),
    /\.qa\/scenarios/,
  );
});

test("validateScenario accepts a local interactive flow", () => {
  assert.deepEqual(
    validateScenario({
      name: "authoring-smoke",
      url: "http://127.0.0.1:5173/",
      steps: [
        { action: "wait-for", selector: "main" },
        { action: "click", selector: "button[data-testid='open-editor']" },
        { action: "fill", selector: "input[name='title']", value: "New title" },
        { action: "screenshot", name: "edited" },
      ],
    }),
    {
      name: "authoring-smoke",
      url: "http://127.0.0.1:5173/",
      viewport: { width: 1440, height: 900 },
      steps: [
        { action: "wait-for", selector: "main" },
        { action: "click", selector: "button[data-testid='open-editor']" },
        { action: "fill", selector: "input[name='title']", value: "New title" },
        { action: "screenshot", name: "edited" },
      ],
    },
  );
});

test("validateScenario rejects remote URLs and unsupported actions", () => {
  assert.throws(
    () => validateScenario({ name: "remote", url: "https://example.com", steps: [] }),
    /loopback URL/,
  );
  assert.throws(
    () =>
      validateScenario({
        name: "unsupported",
        url: "http://localhost:5173",
        steps: [{ action: "evaluate", expression: "document.cookie" }],
      }),
    /Unsupported scenario action/,
  );
});

test("createArtifactPaths keeps attachable video under the bridge's default root", () => {
  const paths = createArtifactPaths("authoring-smoke", new Date("2026-08-07T12:34:56.789Z"));

  assert.match(paths.artifactDirectory, /test-results\/functional-captures\/authoring-smoke-2026-08-07T12-34-56-789Z$/);
  assert.equal(paths.videoDirectory, "/tmp/opencode-functional-captures/authoring-smoke-2026-08-07T12-34-56-789Z");
});
