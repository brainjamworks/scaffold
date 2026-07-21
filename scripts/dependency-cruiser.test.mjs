import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const depcruiseCli = path.join(
  repositoryRoot,
  "node_modules/dependency-cruiser/bin/dependency-cruise.mjs",
);
const productionConfig = path.join(repositoryRoot, ".dependency-cruiser.cjs");

const architectureCompilerOptions = {
  baseUrl: ".",
  module: "ESNext",
  moduleResolution: "bundler",
  noEmit: true,
  paths: {
    "@/*": ["packages/core/src/*"],
    "@scaffold/contracts": ["packages/contracts/src/index.ts"],
    "@scaffold/grading": ["packages/grading/src/index.ts"],
    "@scaffold/core/runtime": ["packages/core/src/entrypoints/runtime.ts"],
    "@scaffold/core/authoring": ["packages/core/src/entrypoints/authoring.ts"],
    "@scaffold/core/agent-host": ["packages/core/src/entrypoints/agent-host.ts"],
    "@scaffold/core/format": ["packages/core/src/entrypoints/format.ts"],
    "@scaffold/core/ports": ["packages/core/src/entrypoints/ports.ts"],
    "@scaffold/core/media-policy": ["packages/core/src/entrypoints/media-policy.ts"],
    "@scaffold/core/styles.css": ["packages/core/src/styles/globals.css"],
  },
  target: "ES2022",
};

async function createFixture(t, files) {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "scaffold-depcruise-"));
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));

  const fixtureFiles = {
    "package.json": JSON.stringify({ private: true, type: "module" }),
    "tsconfig.architecture.json": JSON.stringify({
      compilerOptions: architectureCompilerOptions,
    }),
    ...files,
  };

  await Promise.all(
    Object.entries(fixtureFiles).map(async ([relativePath, contents]) => {
      const absolutePath = path.join(fixtureRoot, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents, "utf8");
    }),
  );

  return fixtureRoot;
}

function cruise(fixtureRoot, outputType, inputs, extraArguments = []) {
  return spawnSync(
    process.execPath,
    [
      depcruiseCli,
      "--config",
      productionConfig,
      "--output-type",
      outputType,
      ...extraArguments,
      ...inputs,
    ],
    { cwd: fixtureRoot, encoding: "utf8" },
  );
}

test("resolves every supported source seam and import form without build output", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/contracts/src/index.ts": "export interface ContractType { id: string }\n",
    "packages/grading/src/index.ts": "export const gradingValue = true;\n",
    "packages/core/src/alias-value.ts": "export const aliasValue = true;\n",
    "packages/core/src/relative-value.ts": "export const relativeValue = true;\n",
    "packages/core/src/entrypoints/runtime.ts": "export const runtimeValue = true;\n",
    "packages/core/src/entrypoints/authoring.ts": "export const authoringValue = true;\n",
    "packages/core/src/entrypoints/agent-host.ts": "export const agentHostValue = true;\n",
    "packages/core/src/entrypoints/format.ts": "export const formatValue = true;\n",
    "packages/core/src/entrypoints/ports.ts": "export const portsValue = true;\n",
    "packages/core/src/entrypoints/media-policy.ts": "export const mediaPolicyValue = true;\n",
    "packages/core/src/styles/globals.css": ":root { --fixture: 1; }\n",
    "apps/playground/src/consumer.ts": [
      'import type { ContractType } from "@scaffold/contracts";',
      'export { gradingValue } from "@scaffold/grading";',
      'import { aliasValue } from "@/alias-value";',
      'import { relativeValue } from "../../../packages/core/src/relative-value";',
      'import { runtimeValue } from "@scaffold/core/runtime";',
      'import { authoringValue } from "@scaffold/core/authoring";',
      'import { formatValue } from "@scaffold/core/format";',
      'import { portsValue } from "@scaffold/core/ports";',
      'import { mediaPolicyValue } from "@scaffold/core/media-policy";',
      'import "@scaffold/core/styles.css";',
      "export const values = { aliasValue, relativeValue, runtimeValue, authoringValue, formatValue, portsValue, mediaPolicyValue };",
      "export type ConsumerContract = ContractType;",
    ].join("\n"),
    "private/agent-consumer/src/consumer.ts": [
      'void import("@scaffold/core/agent-host");',
      "export const privateAgentConsumer = true;",
    ].join("\n"),
  });

  const result = cruise(fixtureRoot, "json", [
    "packages/contracts/src",
    "packages/grading/src",
    "packages/core/src",
    "apps/playground/src",
    "private/agent-consumer/src",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const graph = JSON.parse(result.stdout);
  const consumer = graph.modules.find(({ source }) => source === "apps/playground/src/consumer.ts");
  assert.ok(consumer);

  const resolved = new Map(
    consumer.dependencies.map((dependency) => [dependency.resolved, dependency]),
  );
  const expectedSources = [
    "packages/contracts/src/index.ts",
    "packages/grading/src/index.ts",
    "packages/core/src/alias-value.ts",
    "packages/core/src/relative-value.ts",
    "packages/core/src/entrypoints/runtime.ts",
    "packages/core/src/entrypoints/authoring.ts",
    "packages/core/src/entrypoints/format.ts",
    "packages/core/src/entrypoints/ports.ts",
    "packages/core/src/entrypoints/media-policy.ts",
    "packages/core/src/styles/globals.css",
  ];
  const compareSources = (left, right) => left.localeCompare(right);
  assert.deepEqual([...resolved.keys()].sort(compareSources), expectedSources.sort(compareSources));
  assert.ok(resolved.get("packages/contracts/src/index.ts").dependencyTypes.includes("type-only"));
  assert.ok(resolved.get("packages/grading/src/index.ts").dependencyTypes.includes("export"));
  assert.ok(
    resolved.get("packages/core/src/styles/globals.css").dependencyTypes.includes("import"),
  );

  const privateAgentConsumer = graph.modules.find(
    ({ source }) => source === "private/agent-consumer/src/consumer.ts",
  );
  assert.ok(privateAgentConsumer);
  const agentHostDependency = privateAgentConsumer.dependencies.find(
    ({ resolved: dependency }) => dependency === "packages/core/src/entrypoints/agent-host.ts",
  );
  assert.ok(agentHostDependency);
  assert.equal(agentHostDependency.dynamic, true);
});

test("allows the approved package DAG, public seams, and host contract direction", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/contracts/src/index.ts": "export interface ContractType { id: string }\n",
    "packages/grading/src/index.ts": [
      'import type { ContractType } from "@scaffold/contracts";',
      "export type GradedContract = ContractType;",
      "export const grade = true;",
    ].join("\n"),
    "packages/core/src/host/ports/index.ts": [
      'import type { ContractType } from "@scaffold/contracts";',
      "export type PortContract = ContractType;",
    ].join("\n"),
    "packages/core/src/host/contracts/authoring-host.ts": [
      'import type { PortContract } from "../ports/index";',
      "export interface HostContract { port: PortContract }",
    ].join("\n"),
    "packages/core/src/entrypoints/runtime.ts": "export const runtimeValue = true;\n",
    "packages/core/src/entrypoints/authoring.ts": "export const authoringValue = true;\n",
    "packages/core/src/entrypoints/format.ts": "export const formatValue = true;\n",
    "packages/core/src/entrypoints/ports.ts":
      'export type { PortContract } from "../host/ports/index";\n',
    "packages/core/src/entrypoints/media-policy.ts": "export const mediaPolicyValue = true;\n",
    "packages/core/src/styles/globals.css": ":root { --fixture: 1; }\n",
    "apps/playground/src/consumer.ts": [
      'import type { ContractType } from "@scaffold/contracts";',
      'export { grade } from "@scaffold/grading";',
      'import { runtimeValue } from "@scaffold/core/runtime";',
      'void import("@scaffold/core/authoring");',
      'export { formatValue } from "@scaffold/core/format";',
      'import type { PortContract } from "@scaffold/core/ports";',
      'import "@scaffold/core/styles.css";',
      'const documentation = "@scaffold/core/private";',
      '// import "@scaffold/core/agent-host";',
      "export { documentation, runtimeValue };",
      "export type ConsumerContract = ContractType | PortContract;",
    ].join("\n"),
    "adapters/xblock/frontend/src/consumer.ts": [
      'import type { ContractType } from "@scaffold/contracts";',
      'import { mediaPolicyValue } from "@scaffold/core/media-policy";',
      "export { mediaPolicyValue };",
      "export type AdapterContract = ContractType;",
    ].join("\n"),
  });

  const result = cruise(fixtureRoot, "err-long", [
    "packages/contracts/src",
    "packages/grading/src",
    "packages/core/src",
    "apps/playground/src",
    "adapters/xblock/frontend/src",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("reports prohibited package and framework directions with their native rules", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "node_modules/react/package.json": JSON.stringify({
      name: "react",
      type: "module",
      exports: "./index.js",
    }),
    "node_modules/react/index.js": "export const createElement = () => null;\n",
    "packages/contracts/src/index.ts": "export interface ContractType { id: string }\n",
    "packages/contracts/src/scaffold-leak.ts": [
      'import type { PortContract } from "@scaffold/core/ports";',
      "export type LeakedPort = PortContract;",
    ].join("\n"),
    "packages/contracts/src/framework-leak.ts": [
      'import { createElement } from "react";',
      "export const leakedElement = createElement();",
    ].join("\n"),
    "packages/grading/src/scaffold-leak.ts": [
      'export { runtimeValue } from "@scaffold/core/runtime";',
    ].join("\n"),
    "packages/grading/src/framework-leak.ts": 'import "react";\n',
    "packages/core/src/entrypoints/runtime.ts": "export const runtimeValue = true;\n",
    "packages/core/src/entrypoints/ports.ts": "export interface PortContract { id: string }\n",
    "packages/core/src/grading-leak.ts": [
      'void import("@scaffold/grading");',
      "export const coreLeak = true;",
    ].join("\n"),
    "packages/grading/src/index.ts": "export const grade = true;\n",
  });

  const result = cruise(fixtureRoot, "err-long", [
    "packages/contracts/src",
    "packages/grading/src",
    "packages/core/src",
  ]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /contracts-have-no-scaffold-dependencies/);
  assert.match(output, /contracts-have-no-framework-or-browser-dependencies/);
  assert.match(output, /grading-depends-only-on-contracts/);
  assert.match(output, /grading-has-no-framework-or-browser-dependencies/);
  assert.match(output, /core-does-not-depend-on-grading-apps-or-adapters/);
});

test("reports unsupported public-consumer directions with their native rules", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/contracts/src/index.ts": "export interface ContractType { id: string }\n",
    "packages/contracts/src/private.ts": "export const privateContract = true;\n",
    "packages/grading/src/index.ts": "export const grade = true;\n",
    "packages/grading/src/private.ts": "export const privateGrade = true;\n",
    "packages/core/src/entrypoints/runtime.ts": "export const runtimeValue = true;\n",
    "packages/core/src/entrypoints/agent-host.ts": "export const agentHostValue = true;\n",
    "packages/core/src/private.ts": "export const privateCore = true;\n",
    "apps/playground/src/contract-bypass.ts": [
      'export { privateContract } from "../../../packages/contracts/src/private";',
    ].join("\n"),
    "apps/playground/src/grading-bypass.ts": [
      'import { privateGrade } from "../../../packages/grading/src/private";',
      "export { privateGrade };",
    ].join("\n"),
    "apps/playground/src/core-bypass.ts": [
      'import "../../../packages/core/src/private";',
      'const documentation = "@scaffold/core/private";',
      "export { documentation };",
    ].join("\n"),
    "apps/playground/src/agent-host.ts": [
      'void import("@scaffold/core/agent-host");',
      "export const publicAgentLeak = true;",
    ].join("\n"),
    "apps/other/src/grading.ts": [
      'import { grade } from "@scaffold/grading";',
      "export { grade };",
    ].join("\n"),
    "adapters/xblock/frontend/src/grading.ts": [
      'import "@scaffold/grading";',
      "export const adapterGradeLeak = true;",
    ].join("\n"),
  });

  const result = cruise(fixtureRoot, "err-long", [
    "packages/contracts/src",
    "packages/grading/src",
    "packages/core/src",
    "apps/playground/src",
    "apps/other/src",
    "adapters/xblock/frontend/src",
  ]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /apps-and-adapters-use-contracts-public-entrypoint/);
  assert.match(output, /playground-uses-grading-public-entrypoint/);
  assert.match(output, /grading-is-playground-only/);
  assert.match(output, /apps-and-adapters-use-core-public-entrypoints/);
  assert.match(output, /public-consumers-do-not-use-agent-host/);
});

test("reports Core leaf and private Agent product imports with native rules", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "node_modules/@scaffold/agent/package.json": JSON.stringify({
      name: "@scaffold/agent",
      type: "module",
      exports: "./index.js",
    }),
    "node_modules/@scaffold/agent/index.js": "export const privateAgent = true;\n",
    "packages/core/src/entrypoints/ports.ts": "export interface PortContract { id: string }\n",
    "packages/core/src/editor/leaf.ts": [
      'import type { PortContract } from "@scaffold/core/ports";',
      "export type LeafPort = PortContract;",
    ].join("\n"),
    "packages/core/src/host/agent/product-leak.ts": [
      'import { privateAgent } from "@scaffold/agent";',
      "export { privateAgent };",
    ].join("\n"),
    "apps/playground/src/product-leak.ts": [
      'import { privateAgent } from "@scaffold/agent";',
      "export { privateAgent };",
    ].join("\n"),
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src", "apps/playground/src"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /core-leaves-do-not-import-public-entrypoints/);
  assert.match(output, /core-agent-owners-do-not-reach-private-product/);
  assert.match(output, /public-consumers-do-not-reach-private-agent-product/);
});

test("allows host contracts to consume ports and rejects port implementation reachability", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/core/src/host/ports/index.ts": "export interface PortContract { id: string }\n",
    "packages/core/src/host/contracts/authoring-host.ts": [
      'import type { PortContract } from "../ports/index";',
      "export interface HostContract { port: PortContract }",
    ].join("\n"),
    "packages/core/src/host/ports/provider-leak.ts": [
      'import { intermediate } from "./provider-leak-intermediate";',
      "export { intermediate };",
    ].join("\n"),
    "packages/core/src/host/ports/provider-leak-intermediate.ts": [
      'import { provider } from "../providers/provider";',
      "export const intermediate = provider;",
    ].join("\n"),
    "packages/core/src/host/providers/provider.ts": "export const provider = true;\n",
    "packages/core/src/host/ports/runtime-leak.ts": [
      'import { runtimeValue } from "../../runtime/app/runtime";',
      "export { runtimeValue };",
    ].join("\n"),
    "packages/core/src/runtime/app/runtime.ts": "export const runtimeValue = true;\n",
    "packages/core/src/host/ports/authoring-leak.ts": [
      'import { authoringValue } from "../../editor/shell/authoring/app";',
      "export { authoringValue };",
    ].join("\n"),
    "packages/core/src/editor/shell/authoring/app.ts": "export const authoringValue = true;\n",
    "packages/core/src/host/ports/playground-leak.ts": [
      'import { playgroundValue } from "../../../../../apps/playground/src/value";',
      "export { playgroundValue };",
    ].join("\n"),
    "apps/playground/src/value.ts": "export const playgroundValue = true;\n",
    "packages/core/src/host/ports/adapter-leak.ts": [
      'import { adapterValue } from "../../../../../adapters/xblock/frontend/src/value";',
      "export { adapterValue };",
    ].join("\n"),
    "adapters/xblock/frontend/src/value.ts": "export const adapterValue = true;\n",
  });

  const contractOnlyResult = cruise(fixtureRoot, "err-long", [
    "packages/core/src/host/ports/index.ts",
    "packages/core/src/host/contracts/authoring-host.ts",
  ]);
  assert.equal(
    contractOnlyResult.status,
    0,
    contractOnlyResult.stderr || contractOnlyResult.stdout,
  );

  const result = cruise(fixtureRoot, "err-long", [
    "packages/core/src",
    "apps/playground/src",
    "adapters/xblock/frontend/src",
  ]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /host-ports-do-not-reach-implementations/);
  assert.match(output, /provider-leak\.ts/);
  assert.match(output, /provider-leak-intermediate\.ts/);
  assert.match(output, /providers\/provider\.ts/);
});

test("allows runtime-safe selection facts and the exact dynamic Preview edge", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/core/src/entrypoints/runtime.ts":
      'export { runtimeValue } from "../runtime/app/root";\n',
    "packages/core/src/runtime/app/root.ts": [
      'import { selectionFact } from "../../editor/selection/selection-facts";',
      'import { selectionTransaction } from "../../editor/selection/selection-transactions";',
      'import { blockContext } from "../../editor/selection/block-context";',
      'import { courseSelection } from "../../editor/selection/course-selection-projection";',
      "export const runtimeValue = { selectionFact, selectionTransaction, blockContext, courseSelection };",
    ].join("\n"),
    "packages/core/src/editor/selection/selection-facts.ts": "export const selectionFact = true;\n",
    "packages/core/src/editor/selection/selection-transactions.ts":
      "export const selectionTransaction = true;\n",
    "packages/core/src/editor/selection/block-context.ts": "export const blockContext = true;\n",
    "packages/core/src/editor/selection/course-selection-projection.ts":
      "export const courseSelection = true;\n",
    "packages/core/src/entrypoints/authoring.ts": [
      'export { previewValue } from "../editor/shell/authoring/ScaffoldAuthoringApp";',
    ].join("\n"),
    "packages/core/src/editor/shell/authoring/ScaffoldAuthoringApp.tsx": [
      'export const previewValue = import("../../../runtime/app/ScaffoldLearnerApp");',
    ].join("\n"),
    "packages/core/src/runtime/app/ScaffoldLearnerApp.tsx": "export const learnerApp = true;\n",
    "packages/core/src/runtime/assessment/index.ts": "export const assessment = true;\n",
    "packages/core/src/runtime/learner-activity/index.ts": "export const activity = true;\n",
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("reports transitive and type-only runtime leaks with native dependency paths", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/core/src/entrypoints/runtime.ts":
      'export { runtimeValue } from "../runtime/app/root";\n',
    "packages/core/src/runtime/app/root.ts": [
      'import type { AuthoringType } from "./intermediate";',
      'import { selectionCommand } from "../../editor/selection/selection-commands";',
      'import { nativeDragGuard } from "../../editor/selection/native-drag-guard";',
      "export const runtimeValue = { selectionCommand, nativeDragGuard };",
      "export type RuntimeType = AuthoringType;",
    ].join("\n"),
    "packages/core/src/runtime/app/intermediate.ts": [
      'import type { AuthoringType } from "../../document/authoring/authoring-type";',
      "export type { AuthoringType };",
    ].join("\n"),
    "packages/core/src/document/authoring/authoring-type.ts":
      "export interface AuthoringType { id: string }\n",
    "packages/core/src/editor/selection/selection-commands.ts":
      "export const selectionCommand = true;\n",
    "packages/core/src/editor/selection/native-drag-guard.ts":
      "export const nativeDragGuard = true;\n",
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /runtime-does-not-reach-authoring/);
  assert.match(
    output,
    /runtime\/app\/root\.ts[\s\S]*runtime\/app\/intermediate\.ts[\s\S]*document\/authoring\/authoring-type\.ts/,
  );
  assert.match(output, /editor\/selection\/selection-commands\.ts/);
  assert.match(output, /editor\/selection\/native-drag-guard\.ts/);
});

test("permits only the exact lazy Preview source and target", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/core/src/editor/shell/authoring/ScaffoldAuthoringApp.tsx": [
      'import { learnerApp } from "../../../runtime/app/ScaffoldLearnerApp";',
      'void import("../../../runtime/app/OtherRuntimeApp");',
      "export { learnerApp };",
    ].join("\n"),
    "packages/core/src/editor/shell/authoring/AlternatePreview.tsx": [
      'void import("../../../runtime/app/ScaffoldLearnerApp");',
      "export const alternatePreview = true;",
    ].join("\n"),
    "packages/core/src/runtime/app/ScaffoldLearnerApp.tsx": [
      'import { authoringValue } from "../../editor/shell/authoring/AuthoringValue";',
      "export const learnerApp = authoringValue;",
    ].join("\n"),
    "packages/core/src/runtime/app/OtherRuntimeApp.tsx": "export const otherRuntimeApp = true;\n",
    "packages/core/src/editor/shell/authoring/AuthoringValue.ts":
      "export const authoringValue = true;\n",
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /authoring-does-not-import-runtime-except-preview/);
  assert.match(output, /preview-does-not-import-other-runtime-modules/);
  assert.match(output, /preview-learner-app-import-must-be-dynamic/);
  assert.match(output, /runtime-does-not-reach-authoring/);
});

test("reports assessment, learner-activity, Quiz, and runtime-leaf crossings", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/core/src/entrypoints/runtime.ts": "export const publicRuntime = true;\n",
    "packages/core/src/composition/runtime/root.ts": "export const runtimeComposition = true;\n",
    "packages/core/src/runtime/assessment/root.ts": [
      'import type { ActivityType } from "./intermediate";',
      "export type AssessmentActivityLeak = ActivityType;",
    ].join("\n"),
    "packages/core/src/runtime/assessment/intermediate.ts": [
      'import type { ActivityType } from "../learner-activity/types";',
      "export type { ActivityType };",
    ].join("\n"),
    "packages/core/src/runtime/learner-activity/types.ts": [
      'import { assessmentValue } from "../assessment/value";',
      "export interface ActivityType { id: string }",
      "export const activityAssessmentLeak = assessmentValue;",
    ].join("\n"),
    "packages/core/src/runtime/assessment/value.ts": "export const assessmentValue = true;\n",
    "packages/core/src/runtime/assessment/public-backedge.ts": [
      'import { publicRuntime } from "../../entrypoints/runtime";',
      "export { publicRuntime };",
    ].join("\n"),
    "packages/core/src/runtime/learner-activity/composition-backedge.ts": [
      'import { runtimeComposition } from "../../composition/runtime/root";',
      "export { runtimeComposition };",
    ].join("\n"),
    "packages/core/src/editor/blocks/assessment/quiz/runtime-policy.ts": [
      'import type { ChildType } from "../mcq/runtime-child";',
      "export type QuizChildLeak = ChildType;",
    ].join("\n"),
    "packages/core/src/editor/blocks/assessment/mcq/runtime-child.ts": [
      'import { quizValue } from "../quiz/value";',
      "export interface ChildType { id: string }",
      "export const childQuizLeak = quizValue;",
    ].join("\n"),
    "packages/core/src/editor/blocks/assessment/quiz/value.ts": "export const quizValue = true;\n",
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /assessment-runtime-does-not-reach-learner-activity/);
  assert.match(output, /learner-activity-runtime-does-not-reach-assessment/);
  assert.match(output, /quiz-does-not-reach-concrete-assessment-children/);
  assert.match(output, /concrete-assessment-children-do-not-reach-quiz/);
  assert.match(output, /runtime-leaves-do-not-import-public-entrypoints-or-composition-roots/);
  assert.match(
    output,
    /runtime\/assessment\/root\.ts[\s\S]*runtime\/assessment\/intermediate\.ts[\s\S]*runtime\/learner-activity\/types\.ts/,
  );
});

test("allows explicit block sharing and downward registry and lane composition", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/core/src/editor/blocks/shared/common.ts":
      "export interface CommonBlockType { id: string }\n",
    "packages/core/src/editor/blocks/future/shared/common.ts":
      "export interface FutureBlockType { id: string }\n",
    "packages/core/src/editor/blocks/future/alpha/alpha-node.ts":
      "export interface AlphaNodeType { id: string }\n",
    "packages/core/src/editor/blocks/future/alpha/alpha-definition.ts": [
      'import type { CommonBlockType } from "../../shared/common";',
      'import type { FutureBlockType } from "../shared/common";',
      'import type { AlphaNodeType } from "./alpha-node";',
      "export type AlphaDefinitionType = CommonBlockType | FutureBlockType | AlphaNodeType;",
    ].join("\n"),
    "packages/core/src/editor/blocks/block-registry.ts":
      "export interface BlockRegistryType { id: string }\n",
    "packages/core/src/editor/blocks/built-in-block-definitions.ts": [
      'import type { AlphaDefinitionType } from "./future/alpha/alpha-definition";',
      'import type { BlockRegistryType } from "./block-registry";',
      "export type BuiltInBlocks = AlphaDefinitionType | BlockRegistryType;",
    ].join("\n"),
    "packages/core/src/editor/blocks/authoring-block-extensions.ts": [
      'import type { AlphaDefinitionType } from "./future/alpha/alpha-definition";',
      "export type AuthoringBlocks = AlphaDefinitionType;",
    ].join("\n"),
    "packages/core/src/editor/blocks/runtime-block-extensions.ts": [
      'import type { AlphaDefinitionType } from "./future/alpha/alpha-definition";',
      "export type RuntimeBlocks = AlphaDefinitionType;",
    ].join("\n"),
    "packages/core/src/editor/arrangements/layout/model/layout-registry.ts":
      "export interface LayoutRegistryType { id: string }\n",
    "packages/core/src/editor/arrangements/layout/authoring/layout-view-registry.ts": [
      'import type { LayoutRegistryType } from "../model/layout-registry";',
      "export type AuthoringLayoutRegistry = LayoutRegistryType;",
    ].join("\n"),
    "packages/core/src/editor/arrangements/layout/runtime/layout-view-registry.ts": [
      'import type { LayoutRegistryType } from "../model/layout-registry";',
      "export type RuntimeLayoutRegistry = LayoutRegistryType;",
    ].join("\n"),
    "packages/core/src/editor/surfaces/model/surface-variant-registry.ts":
      "export interface SurfaceRegistryType { id: string }\n",
    "packages/core/src/editor/surfaces/authoring/surface-authoring-views.ts": [
      'import type { SurfaceRegistryType } from "../model/surface-variant-registry";',
      "export type AuthoringSurfaceRegistry = SurfaceRegistryType;",
    ].join("\n"),
    "packages/core/src/editor/surfaces/runtime/surface-runtime-views.ts": [
      'import type { SurfaceRegistryType } from "../model/surface-variant-registry";',
      "export type RuntimeSurfaceRegistry = SurfaceRegistryType;",
    ].join("\n"),
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("reports block peer, construction, registry-view, and lane inversions", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "node_modules/react/package.json": JSON.stringify({
      name: "react",
      type: "module",
      exports: "./index.js",
    }),
    "node_modules/react/index.js": "export interface ReactFixtureType { id: string }\n",
    "packages/core/src/editor/blocks/future/beta/beta-model.ts":
      "export interface BetaModel { id: string }\n",
    "packages/core/src/editor/blocks/future/alpha/alpha-model.ts": [
      'import type { BetaModel } from "../beta/beta-model";',
      "export type AlphaPeerLeak = BetaModel;",
    ].join("\n"),
    "packages/core/src/editor/blocks/future/alpha/alpha-definition.ts": [
      'import type { ConstructionLeak } from "./construction-leak";',
      "export type AlphaDefinitionLeak = ConstructionLeak;",
    ].join("\n"),
    "packages/core/src/editor/blocks/future/alpha/construction-leak.ts": [
      'import type { BuiltInBlocks } from "../../built-in-block-definitions";',
      "export type ConstructionLeak = BuiltInBlocks;",
    ].join("\n"),
    "packages/core/src/editor/blocks/built-in-block-definitions.ts":
      "export interface BuiltInBlocks { id: string }\n",
    "packages/core/src/editor/blocks/block-registry.ts": [
      'import type { FutureNodeView } from "./future/alpha/alpha-view";',
      "export type RegistryViewLeak = FutureNodeView;",
    ].join("\n"),
    "packages/core/src/editor/blocks/future/alpha/alpha-view.tsx": [
      'import type { ReactFixtureType } from "react";',
      "export type FutureNodeView = ReactFixtureType;",
    ].join("\n"),
    "packages/core/src/editor/blocks/authoring-block-extensions.ts": [
      'import type { RuntimeLane } from "./runtime-block-extensions";',
      "export type AuthoringLane = RuntimeLane;",
    ].join("\n"),
    "packages/core/src/editor/blocks/runtime-block-extensions.ts": [
      'import type { AuthoringLane } from "./authoring-block-extensions";',
      "export type RuntimeLane = AuthoringLane;",
    ].join("\n"),
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /block-features-do-not-import-peer-features/);
  assert.match(output, /block-definitions-do-not-reach-construction-roots/);
  assert.match(output, /block-registry-does-not-reach-react-views-or-lane-lists/);
  assert.match(output, /authoring-block-lane-does-not-reach-runtime-block-lane/);
  assert.match(output, /runtime-block-lane-does-not-reach-authoring-block-lane/);
});

test("reports layout model, Frame, and lane inversions", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "node_modules/react/package.json": JSON.stringify({
      name: "react",
      type: "module",
      exports: "./index.js",
    }),
    "node_modules/react/index.js": "export interface ReactFixtureType { id: string }\n",
    "packages/core/src/editor/arrangements/layout/model/layout-registry.ts": [
      'import type { ReactFixtureType } from "react";',
      "export type LayoutRegistryReactLeak = ReactFixtureType;",
    ].join("\n"),
    "packages/core/src/editor/arrangements/layout/model/layout-definition.ts": [
      'import type { FrameLeak } from "./layout-frame-leak";',
      "export type LayoutDefinitionFrameLeak = FrameLeak;",
    ].join("\n"),
    "packages/core/src/editor/arrangements/layout/model/layout-frame-leak.ts": [
      'import type { FrameLeak } from "../../../frame/authoring/frame-leak";',
      "export type { FrameLeak };",
    ].join("\n"),
    "packages/core/src/editor/frame/authoring/frame-leak.ts":
      "export interface FrameLeak { id: string }\n",
    "packages/core/src/editor/arrangements/layout/authoring/layout-view-registry.ts": [
      'import type { RuntimeLayoutLane } from "../runtime/layout-view-registry";',
      "export type AuthoringLayoutLane = RuntimeLayoutLane;",
    ].join("\n"),
    "packages/core/src/editor/arrangements/layout/runtime/layout-view-registry.ts": [
      'import type { AuthoringLayoutLane } from "../authoring/layout-view-registry";',
      "export type RuntimeLayoutLane = AuthoringLayoutLane;",
    ].join("\n"),
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /layout-model-does-not-reach-views-or-block-owners/);
  assert.match(output, /layout-model-does-not-import-react/);
  assert.match(output, /authoring-layout-lane-does-not-reach-runtime-layout-lane/);
  assert.match(output, /runtime-layout-lane-does-not-reach-authoring-layout-lane/);
});

test("reports surface model, player, shell, and lane inversions", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "node_modules/react/package.json": JSON.stringify({
      name: "react",
      type: "module",
      exports: "./index.js",
    }),
    "node_modules/react/index.js": "export interface ReactFixtureType { id: string }\n",
    "packages/core/src/editor/surfaces/model/surface-variant-registry.ts": [
      'import type { ReactFixtureType } from "react";',
      "export type SurfaceRegistryReactLeak = ReactFixtureType;",
    ].join("\n"),
    "packages/core/src/editor/surfaces/model/surface-variant-definition.ts": [
      'import type { SurfacePolicyLeak } from "./surface-policy-leak";',
      "export type SurfaceDefinitionLeak = SurfacePolicyLeak;",
    ].join("\n"),
    "packages/core/src/editor/surfaces/model/surface-policy-leak.ts": [
      'import type { PlayerLeak } from "../../../runtime/players/player-leak";',
      'import type { ShellLeak } from "../../shell/shell-leak";',
      "export type SurfacePolicyLeak = PlayerLeak | ShellLeak;",
    ].join("\n"),
    "packages/core/src/runtime/players/player-leak.ts":
      "export interface PlayerLeak { id: string }\n",
    "packages/core/src/editor/shell/shell-leak.ts": "export interface ShellLeak { id: string }\n",
    "packages/core/src/editor/surfaces/authoring/surface-authoring-views.ts": [
      'import type { RuntimeSurfaceLane } from "../runtime/surface-runtime-views";',
      "export type AuthoringSurfaceLane = RuntimeSurfaceLane;",
    ].join("\n"),
    "packages/core/src/editor/surfaces/runtime/surface-runtime-views.ts": [
      'import type { AuthoringSurfaceLane } from "../authoring/surface-authoring-views";',
      "export type RuntimeSurfaceLane = AuthoringSurfaceLane;",
    ].join("\n"),
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /surface-model-does-not-reach-views-players-shell-or-entrypoints/);
  assert.match(output, /surface-model-does-not-import-react/);
  assert.match(output, /authoring-surface-lane-does-not-reach-runtime-surface-lane/);
  assert.match(output, /runtime-surface-lane-does-not-reach-authoring-surface-lane/);
});

test("allows named neutral adaptation and downward lane composition", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "node_modules/@tiptap/core/package.json": JSON.stringify({
      name: "@tiptap/core",
      type: "module",
      exports: "./index.js",
    }),
    "node_modules/@tiptap/core/index.js": "export interface TiptapFixtureType { id: string }\n",
    "node_modules/@tiptap/pm/package.json": JSON.stringify({
      name: "@tiptap/pm",
      type: "module",
      exports: { "./state": "./state.js" },
    }),
    "node_modules/@tiptap/pm/state.js":
      "export interface ProseMirrorSelectionFixture { from: number }\n",
    "packages/core/src/document/model/document-model.ts": [
      'import type { TiptapFixtureType } from "@tiptap/core";',
      "export type DocumentModel = TiptapFixtureType;",
    ].join("\n"),
    "packages/core/src/composition/model/create-document-composition.ts": [
      'import type { DocumentModel } from "../../document/model/document-model";',
      "export type DocumentComposition = DocumentModel;",
    ].join("\n"),
    "packages/core/src/editor/selection/selection-facts.ts": [
      'import type { ProseMirrorSelectionFixture } from "@tiptap/pm/state";',
      "export type SelectionFacts = ProseMirrorSelectionFixture;",
    ].join("\n"),
    "packages/core/src/runtime/renderer/runtime.ts": [
      'import type { SelectionFacts } from "../../editor/selection/selection-facts";',
      "export type RuntimeSelectionFacts = SelectionFacts;",
    ].join("\n"),
    "packages/core/src/editor/frame/model/frame-model.ts":
      "export interface FrameModel { id: string }\n",
    "packages/core/src/editor/drag/model/drag-model.ts": [
      'import type { FrameModel } from "../../frame/model/frame-model";',
      "export type DragModel = FrameModel;",
    ].join("\n"),
    "packages/core/src/composition/authoring/create-authoring-composition.ts": [
      'import type { DocumentComposition } from "../model/create-document-composition";',
      'import type { DragModel } from "../../editor/drag/model/drag-model";',
      "export type AuthoringComposition = DocumentComposition | DragModel;",
    ].join("\n"),
    "packages/core/src/composition/runtime/create-runtime-composition.ts": [
      'import type { DocumentComposition } from "../model/create-document-composition";',
      "export type RuntimeComposition = DocumentComposition;",
    ].join("\n"),
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("reports named neutral owner and leaf-to-composition inversions", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "node_modules/react/package.json": JSON.stringify({
      name: "react",
      type: "module",
      exports: "./index.js",
    }),
    "node_modules/react/index.js": "export interface ReactFixtureType { id: string }\n",
    "packages/core/src/document/model/document-model.ts": [
      'import type { ReactFixtureType } from "react";',
      'import type { AuthoringDocumentLeak } from "../authoring/authoring-document";',
      "export type DocumentModelLeak = ReactFixtureType | AuthoringDocumentLeak;",
    ].join("\n"),
    "packages/core/src/document/authoring/authoring-document.ts":
      "export interface AuthoringDocumentLeak { id: string }\n",
    "packages/core/src/composition/model/create-document-composition.ts": [
      'import type { CompositionLeak } from "./composition-leak";',
      "export type NeutralCompositionLeak = CompositionLeak;",
    ].join("\n"),
    "packages/core/src/composition/model/composition-leak.ts": [
      'import type { ShellLeak } from "../../editor/shell/shell-leak";',
      "export type CompositionLeak = ShellLeak;",
    ].join("\n"),
    "packages/core/src/editor/arrangements/grid/model/grid-model.ts": [
      'import type { RuntimeLeak } from "../runtime/runtime-grid";',
      "export type GridModelLeak = RuntimeLeak;",
    ].join("\n"),
    "packages/core/src/editor/arrangements/grid/runtime/runtime-grid.ts":
      "export interface RuntimeLeak { id: string }\n",
    "packages/core/src/editor/arrangements/layout/model/layout-helper.ts": [
      'import type { ShellLeak } from "../../../shell/shell-leak";',
      "export type LayoutModelLeak = ShellLeak;",
    ].join("\n"),
    "packages/core/src/editor/frame/model/frame-model.ts": [
      'import type { ShellLeak } from "../../shell/shell-leak";',
      "export type FrameModelLeak = ShellLeak;",
    ].join("\n"),
    "packages/core/src/editor/drag/model/drag-model.ts": [
      'import "./drag-model.css";',
      'import type { AuthoringComposition } from "../../../composition/authoring/create-authoring-composition";',
      "export type DragModelLeak = AuthoringComposition;",
    ].join("\n"),
    "packages/core/src/editor/drag/model/drag-model.css": ".drag-model-leak { display: block; }\n",
    "packages/core/src/editor/selection/selection-facts.ts": [
      'import type { ShellLeak } from "../shell/shell-leak";',
      "export type SelectionOwnerLeak = ShellLeak;",
    ].join("\n"),
    "packages/core/src/editor/blocks/block-registry.ts": [
      'import type { ShellLeak } from "../shell/shell-leak";',
      "export type BlockConstructionLeak = ShellLeak;",
    ].join("\n"),
    "packages/core/src/editor/shell/shell-leak.ts": "export interface ShellLeak { id: string }\n",
    "packages/core/src/editor/rich-text/model/composition-backedge.ts": [
      'import type { RuntimeComposition } from "../../../composition/runtime/create-runtime-composition";',
      "export type CompositionBackedge = RuntimeComposition;",
    ].join("\n"),
    "packages/core/src/composition/authoring/create-authoring-composition.ts":
      "export interface AuthoringComposition { id: string }\n",
    "packages/core/src/composition/runtime/create-runtime-composition.ts":
      "export interface RuntimeComposition { id: string }\n",
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /classified-neutral-owners-do-not-import-react-or-css/);
  assert.match(output, /document-model-does-not-reach-higher-owners/);
  assert.match(output, /neutral-composition-does-not-reach-lane-or-shell-owners/);
  assert.match(output, /grid-model-does-not-reach-higher-owners/);
  assert.match(output, /layout-model-does-not-reach-higher-owners/);
  assert.match(output, /frame-model-does-not-reach-higher-owners/);
  assert.match(output, /drag-model-does-not-reach-higher-owners/);
  assert.match(output, /neutral-selection-does-not-reach-authoring-policy/);
  assert.match(output, /block-construction-does-not-reach-higher-owners/);
  assert.match(output, /core-leaves-do-not-reach-lane-composition-roots/);
});

test("allows target adapters to consume the framework-neutral kernel and vanilla store", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "node_modules/react/package.json": JSON.stringify({
      name: "react",
      type: "module",
      exports: "./index.js",
    }),
    "node_modules/react/index.js": "export interface ReactFixtureType { id: string }\n",
    "node_modules/zustand/package.json": JSON.stringify({
      name: "zustand",
      type: "module",
      exports: { ".": "./index.js", "./vanilla": "./vanilla.js" },
    }),
    "node_modules/zustand/index.js": "export interface ReactStoreFixture { id: string }\n",
    "node_modules/zustand/vanilla.js": "export interface VanillaStoreFixture { id: string }\n",
    "packages/core/src/editor/interactions/targets/model/owner.ts":
      "export interface TargetModel { id: string }\n",
    "packages/core/src/editor/interactions/targets/engine/engine.ts": [
      'import type { TargetModel } from "../model/owner";',
      "export type TargetEngine = TargetModel;",
    ].join("\n"),
    "packages/core/src/editor/interactions/targets/facade/interaction-store.ts": [
      'import type { VanillaStoreFixture } from "zustand/vanilla";',
      'import type { TargetEngine } from "../engine/engine";',
      'import type { TargetModel } from "../model/owner";',
      "export type InteractionStore = VanillaStoreFixture | TargetEngine | TargetModel;",
    ].join("\n"),
    "packages/core/src/editor/interactions/targets/facade/interaction-provider.tsx": [
      'import type { ReactFixtureType } from "react";',
      'import type { ReactStoreFixture } from "zustand";',
      'import type { InteractionStore } from "./interaction-store";',
      "export type InteractionProvider = ReactFixtureType | ReactStoreFixture | InteractionStore;",
    ].join("\n"),
    "packages/core/src/editor/interactions/targets/prosemirror/projection.ts": [
      'import type { TargetEngine } from "../engine/engine";',
      'import type { InteractionStore } from "../facade/interaction-store";',
      "export type ProseMirrorProjection = TargetEngine | InteractionStore;",
    ].join("\n"),
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("reports interaction kernel, store, and provider ownership inversions", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "node_modules/@tiptap/pm/package.json": JSON.stringify({
      name: "@tiptap/pm",
      type: "module",
      exports: { "./state": "./state.js" },
    }),
    "node_modules/@tiptap/pm/state.js": "export interface ProseMirrorStateFixture { id: string }\n",
    "packages/core/src/editor/interactions/targets/model/owner.ts": [
      'import type { TargetEngine } from "../engine/engine";',
      'import type { BlockPolicy } from "../../../blocks/future/alpha/policy";',
      "export type TargetModelLeak = TargetEngine | BlockPolicy;",
    ].join("\n"),
    "packages/core/src/editor/interactions/targets/engine/engine.ts": [
      'import type { TargetModelLeak } from "../model/owner";',
      'import type { InteractionProvider } from "../facade/interaction-provider";',
      "export type TargetEngine = TargetModelLeak | InteractionProvider;",
    ].join("\n"),
    "packages/core/src/editor/interactions/targets/facade/interaction-store.ts": [
      'import type { ProseMirrorStateFixture } from "@tiptap/pm/state";',
      "export type InteractionStoreLeak = ProseMirrorStateFixture;",
    ].join("\n"),
    "packages/core/src/editor/interactions/targets/facade/interaction-provider.tsx": [
      'import type { ProseMirrorAdapter } from "../prosemirror/adapter";',
      "export type InteractionProvider = ProseMirrorAdapter;",
    ].join("\n"),
    "packages/core/src/editor/interactions/targets/prosemirror/adapter.ts":
      "export interface ProseMirrorAdapter { id: string }\n",
    "packages/core/src/editor/blocks/future/alpha/policy.ts":
      "export interface BlockPolicy { id: string }\n",
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /interaction-target-model-does-not-reach-engine-adapters-or-feature-policy/);
  assert.match(output, /interaction-target-engine-does-not-reach-adapters-or-feature-policy/);
  assert.match(output, /interaction-store-remains-framework-neutral/);
  assert.match(output, /interaction-provider-does-not-reach-prosemirror-or-feature-policy/);
});

test("distinguishes low-level floating infrastructure from higher coordinators", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/core/src/editor/interactions/targets/model/target.ts":
      "export interface TargetModel { id: string }\n",
    "packages/core/src/editor/blocks/future/alpha/alpha-definition.ts":
      "export interface AlphaDefinition { id: string }\n",
    "packages/core/src/editor/interactions/floating/floating-coordinator.ts": [
      'import type { TargetModel } from "../targets/model/target";',
      'import type { AlphaDefinition } from "../../blocks/future/alpha/alpha-definition";',
      "export type FloatingCoordinator = TargetModel | AlphaDefinition;",
    ].join("\n"),
    "packages/core/src/editor/interactions/floating/floating-anchor.ts": [
      'import type { ShellPolicy } from "../../shell/private-policy";',
      "export type FloatingAnchorLeak = ShellPolicy;",
    ].join("\n"),
    "packages/core/src/editor/interactions/bubble/bubble-anchor.ts": [
      'import type { BlockAuthoringState } from "../../blocks/future/alpha/authoring-state";',
      "export type BubbleAnchorLeak = BlockAuthoringState;",
    ].join("\n"),
    "packages/core/src/ui/overlays/portal-host-context.tsx": [
      'import type { ShellPolicy } from "../../editor/shell/private-policy";',
      "export type PortalHostLeak = ShellPolicy;",
    ].join("\n"),
    "packages/core/src/editor/shell/private-policy.ts":
      "export interface ShellPolicy { id: string }\n",
    "packages/core/src/editor/blocks/future/alpha/authoring-state.ts":
      "export interface BlockAuthoringState { id: string }\n",
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /low-level-floating-infrastructure-does-not-reach-shell-or-feature-policy/);
  assert.doesNotMatch(output, /floating-coordinator\.ts/);
});

test("allows semantic Frame and Drag seams and reports private-state and insertion inversions", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/core/src/editor/interactions/gesture/gesture.ts":
      "export interface GestureSeam { id: string }\n",
    "packages/core/src/editor/interactions/targets/model/target.ts":
      "export interface TargetSeam { id: string }\n",
    "packages/core/src/editor/frame/authoring/frame-coordinator.ts": [
      'import type { GestureSeam } from "../../interactions/gesture/gesture";',
      'import type { TargetSeam } from "../../interactions/targets/model/target";',
      "export type FrameCoordinator = GestureSeam | TargetSeam;",
    ].join("\n"),
    "packages/core/src/editor/drag/view/drag-coordinator.ts": [
      'import type { GestureSeam } from "../../interactions/gesture/gesture";',
      'import type { TargetSeam } from "../../interactions/targets/model/target";',
      "export type DragCoordinator = GestureSeam | TargetSeam;",
    ].join("\n"),
    "packages/core/src/editor/frame/authoring/resize/private-resize-state.ts": [
      'import type { DragTransientState } from "../../../drag/view/private-drag-state";',
      "export type FrameDragLeak = DragTransientState;",
    ].join("\n"),
    "packages/core/src/editor/drag/view/private-drag-state.ts": [
      'import type { PrivateResizeState } from "../../frame/authoring/resize/private-resize-state";',
      "export interface DragTransientState { id: string }",
      "export type DragFrameLeak = PrivateResizeState;",
    ].join("\n"),
    "packages/core/src/editor/insertion/insert-catalog.ts": [
      'import type { InsertionLeak } from "./insertion-leak";',
      "export type InsertCatalogLeak = InsertionLeak;",
    ].join("\n"),
    "packages/core/src/editor/insertion/insertion-leak.ts": [
      'import type { ShellLeak } from "../shell/shell-leak";',
      'import type { RuntimeLane } from "../blocks/runtime-block-extensions";',
      "export type InsertionLeak = ShellLeak | RuntimeLane;",
    ].join("\n"),
    "packages/core/src/editor/shell/shell-leak.ts": "export interface ShellLeak { id: string }\n",
    "packages/core/src/editor/blocks/runtime-block-extensions.ts":
      "export interface RuntimeLane { id: string }\n",
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /frame-authoring-does-not-reach-drag-view-state/);
  assert.match(output, /drag-view-does-not-reach-frame-authoring-state/);
  assert.match(output, /insertion-does-not-reach-shell-runtime-or-lane-construction/);
  assert.doesNotMatch(output, /frame-coordinator\.ts/);
  assert.doesNotMatch(output, /drag-coordinator\.ts/);
});

test("allows Radix wrappers and reports direct Radix imports elsewhere in Core", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "node_modules/@radix-ui/react-dialog/package.json": JSON.stringify({
      name: "@radix-ui/react-dialog",
      type: "module",
      exports: "./index.js",
    }),
    "node_modules/@radix-ui/react-dialog/index.js": "export const DialogRoot = true;\n",
    "packages/core/src/ui/components/Dialog.tsx": [
      'import { DialogRoot } from "@radix-ui/react-dialog";',
      "export const Dialog = DialogRoot;",
    ].join("\n"),
    "packages/core/src/editor/blocks/future/alpha/alpha-view.tsx":
      'export { DialogRoot } from "@radix-ui/react-dialog";\n',
    "packages/core/src/editor/arrangements/layout/authoring/layout-view.tsx":
      'import "@radix-ui/react-dialog";\n',
    "packages/core/src/editor/shell/direct-radix.tsx": [
      'void import("@radix-ui/react-dialog");',
      "export const directRadix = true;",
    ].join("\n"),
  });

  const wrapperResult = cruise(fixtureRoot, "err-long", [
    "packages/core/src/ui/components/Dialog.tsx",
  ]);
  assert.equal(wrapperResult.status, 0, wrapperResult.stderr || wrapperResult.stdout);

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /radix-is-owned-by-core-ui-components/);
  assert.match(output, /alpha-view\.tsx/);
  assert.match(output, /layout-view\.tsx/);
  assert.match(output, /direct-radix\.tsx/);
});

test("reports an unresolved supported internal import with the native rule", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/core/src/consumer.ts": 'import "./missing";\n',
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(`${result.stdout}\n${result.stderr}`, /no-unresolved-internal-dependencies/);
});

test("reports an unsupported private Core subpath with the native rule", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "apps/playground/src/consumer.ts": 'import "@scaffold/core/private";\n',
  });

  const result = cruise(fixtureRoot, "err-long", ["apps/playground/src"]);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(`${result.stdout}\n${result.stderr}`, /no-unresolved-internal-dependencies/);
});

test("reports an executable cycle with the native runtime-cycle rule", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/core/src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
    "packages/core/src/b.ts": 'import { a } from "./a";\nexport const b = a;\n',
  });

  const result = cruise(fixtureRoot, "err-long", ["packages/core/src"]);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(`${result.stdout}\n${result.stderr}`, /no-circular-at-runtime/);
});

test("allows a pure type-only cycle while retaining its graph edges", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/core/src/a.ts": ['import type { B } from "./b";', "export interface A { b: B }"].join(
      "\n",
    ),
    "packages/core/src/b.ts": ['import type { A } from "./a";', "export interface B { a: A }"].join(
      "\n",
    ),
  });

  const result = cruise(fixtureRoot, "json", ["packages/core/src"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const graph = JSON.parse(result.stdout);
  const typeEdges = graph.modules.flatMap(({ dependencies }) => dependencies);
  assert.equal(typeEdges.length, 2);
  assert.ok(typeEdges.every(({ dependencyTypes }) => dependencyTypes.includes("type-only")));
});

test("uses the native known-violation identity only inside a disposable fixture", async (t) => {
  const fixtureRoot = await createFixture(t, {
    "packages/core/src/known.ts": 'import "./missing";\n',
  });
  const baselinePath = path.join(fixtureRoot, "known-violations.json");
  const inputs = ["packages/core/src"];

  const baselineResult = cruise(fixtureRoot, "baseline", inputs, ["--output-to", baselinePath]);
  assert.equal(baselineResult.status, 0, baselineResult.stderr || baselineResult.stdout);

  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  assert.deepEqual(baseline, [
    {
      type: "dependency",
      from: "packages/core/src/known.ts",
      to: "./missing",
      unresolvedTo: "./missing",
      dependencyTypes: ["unknown"],
      rule: {
        severity: "error",
        name: "no-unresolved-internal-dependencies",
      },
    },
  ]);

  const ignoredResult = cruise(fixtureRoot, "err-long", inputs, ["--ignore-known", baselinePath]);
  const ignoredOutput = `${ignoredResult.stdout}\n${ignoredResult.stderr}`;
  assert.equal(ignoredResult.status, 0, ignoredOutput);
  assert.match(ignoredOutput, /no dependency violations found/);
  assert.match(ignoredOutput, /1 known violations ignored/);

  await writeFile(
    path.join(fixtureRoot, "packages/core/src/new.ts"),
    'import "./another-missing";\n',
    "utf8",
  );
  const unmatchedResult = cruise(fixtureRoot, "err-long", inputs, ["--ignore-known", baselinePath]);
  const unmatchedOutput = `${unmatchedResult.stdout}\n${unmatchedResult.stderr}`;
  assert.equal(unmatchedResult.status, 1, unmatchedOutput);
  assert.match(unmatchedOutput, /no-unresolved-internal-dependencies/);
  assert.match(unmatchedOutput, /packages\/core\/src\/new\.ts/);
  assert.match(unmatchedOutput, /1 known violations ignored/);

  await rm(path.join(fixtureRoot, "packages/core/src/new.ts"));
  const exposedResult = cruise(fixtureRoot, "err-long", inputs, [
    "--ignore-known",
    baselinePath,
    "--no-ignore-known",
  ]);
  const exposedOutput = `${exposedResult.stdout}\n${exposedResult.stderr}`;
  assert.equal(exposedResult.status, 1, exposedOutput);
  assert.match(exposedOutput, /no-unresolved-internal-dependencies/);
  assert.match(exposedOutput, /packages\/core\/src\/known\.ts/);

  await rm(baselinePath);
  await assert.rejects(access(baselinePath));
});
