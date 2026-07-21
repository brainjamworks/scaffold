import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILT_IN_BLOCK_DEFINITIONS_PATH =
  "packages/core/src/editor/blocks/built-in-block-definitions.ts";
const BLOCKS_RUNTIME_EXTENSIONS_PATH =
  "packages/core/src/editor/blocks/runtime-block-extensions.ts";
const BLOCKS_AUTHORING_EXTENSIONS_PATH =
  "packages/core/src/editor/blocks/authoring-block-extensions.ts";
const BLOCK_REGISTRATION_FIXTURE_FILES = new Set([
  BUILT_IN_BLOCK_DEFINITIONS_PATH,
  BLOCKS_RUNTIME_EXTENSIONS_PATH,
  BLOCKS_AUTHORING_EXTENSIONS_PATH,
]);

test("dry run prints the block files it would write", () => {
  const result = runCreateBlock(["--name", "Demo", "--recipe", "content", "--dry-run"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /packages\/core\/src\/editor\/blocks\/Demo\/index\.tsx/);
});

test("rejects missing block name", () => {
  const result = runCreateBlock(["--recipe", "content", "--dry-run"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--name is required/);
});

test("rejects missing block recipe", () => {
  const result = runCreateBlock(["--name", "Demo", "--dry-run"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--recipe is required/);
});

test("rejects unknown recipes", () => {
  const result = runCreateBlock(["--name", "Demo", "--recipe", "unknown", "--dry-run"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown recipe/);
});

test("refuses to overwrite existing files", (t) => {
  const root = createFixtureRoot(t);
  writeFixtureFile(root, "packages/core/src/editor/blocks/Demo/index.tsx", "export {};\n");

  const result = runCreateBlock(["--name", "Demo", "--recipe", "content"], root);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to overwrite/);
  assert.match(result.stderr, /packages\/core\/src\/editor\/blocks\/Demo\/index\.tsx/);
});

test("content recipe writes schema, node, view, index, and contract test", (t) => {
  const root = createFixtureRoot(t);

  const result = runCreateBlock(["--name", "Demo", "--recipe", "content"], root);

  assert.equal(result.status, 0, result.stderr);
  assertFixtureFiles(root, [
    "packages/core/src/schemas/blocks/demo.ts",
    "packages/core/src/editor/blocks/Demo/index.tsx",
    "packages/core/src/editor/blocks/Demo/node.ts",
    "packages/core/src/editor/blocks/Demo/Demo.tsx",
    "packages/core/src/editor/blocks/Demo/demo-authoring-extension.tsx",
    "packages/core/src/editor/blocks/Demo/demo-definition.ts",
    "packages/core/src/editor/blocks/Demo/demo-runtime-extension.tsx",
    "packages/core/src/editor/blocks/Demo/Demo.test.ts",
  ]);

  assert.match(
    readFixtureFile(root, "packages/core/src/schemas/blocks/demo.ts"),
    /export const DemoDataSchema = z\.object\(/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/schemas/blocks/demo.ts"),
    /export type DemoData = z\.infer<typeof DemoDataSchema>/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-definition.ts"),
    /defineBlock\(/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-definition.ts"),
    /from '@\/editor\/blocks\/block-definition'/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-definition.ts"),
    /from '@\/editor\/configuration\/definition'/,
  );
  assert.doesNotMatch(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-definition.ts"),
    /from '@\/editor\/registry'|host\/agent|built-in-block-definitions|built-in-insert-catalog|authoring-block-extensions|runtime-block-extensions|editor\/configuration\/checked-settings/,
  );
  assert.doesNotMatch(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-definition.ts"),
    /^  id:/m,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-definition.ts"),
    /insert: \{\n    id: DEMO_BLOCK_ID,/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-definition.ts"),
    /createStableId\('block'\)/,
  );
  assert.doesNotMatch(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/Demo.tsx"),
    /editor\.isEditable/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/node.ts"),
    /section\[data-node="demo"\]/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/Demo.tsx"),
    /data-node="demo"/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-authoring-extension.tsx"),
    /createBlockAuthoringNodeView/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-authoring-extension.tsx"),
    /from '@\/editor\/frame\/authoring\/create-block-authoring-node-view'/,
  );
  assert.doesNotMatch(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-runtime-extension.tsx"),
    /courseBlockAuthoringFrameAttributes|createBlockAuthoringNodeView/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-runtime-extension.tsx"),
    /from '@\/editor\/frame\/runtime\/create-block-runtime-node-view'/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/Demo.tsx"),
    /throw new Error\('Implement Demo body rendering before shipping this block\.'\)/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/Demo.test.ts"),
    /describeBlockContract\(/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/blocks/Demo/Demo.test.ts"),
    /expectsFrame: true/,
  );
});

test("content recipe scaffold works end to end in a temp root", (t) => {
  const root = createFixtureRoot(t);

  const result = runCreateBlock(["--name", "Smoke Block", "--recipe", "content"], root);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fixtureSourceFiles(root), [
    "packages/core/src/editor/blocks/SmokeBlock/SmokeBlock.test.ts",
    "packages/core/src/editor/blocks/SmokeBlock/SmokeBlock.tsx",
    "packages/core/src/editor/blocks/SmokeBlock/index.tsx",
    "packages/core/src/editor/blocks/SmokeBlock/node.ts",
    "packages/core/src/editor/blocks/SmokeBlock/smoke-block-authoring-extension.tsx",
    "packages/core/src/editor/blocks/SmokeBlock/smoke-block-definition.ts",
    "packages/core/src/editor/blocks/SmokeBlock/smoke-block-runtime-extension.tsx",
    "packages/core/src/schemas/blocks/smoke-block.ts",
  ]);

  const schemaSource = readFixtureFile(root, "packages/core/src/schemas/blocks/smoke-block.ts");
  const definitionSource = readFixtureFile(
    root,
    "packages/core/src/editor/blocks/SmokeBlock/smoke-block-definition.ts",
  );
  const authoringSource = readFixtureFile(
    root,
    "packages/core/src/editor/blocks/SmokeBlock/smoke-block-authoring-extension.tsx",
  );
  const viewSource = readFixtureFile(
    root,
    "packages/core/src/editor/blocks/SmokeBlock/SmokeBlock.tsx",
  );
  const testSource = readFixtureFile(
    root,
    "packages/core/src/editor/blocks/SmokeBlock/SmokeBlock.test.ts",
  );

  assert.match(schemaSource, /export const SmokeBlockDataSchema = z\.object\(/);
  assert.match(definitionSource, /defineBlock\(/);
  assert.doesNotMatch(definitionSource, /^  id:/m);
  assert.match(definitionSource, /createStableId\('block'\)/);
  assert.match(authoringSource, /createBlockAuthoringNodeView\(/);
  assert.match(
    viewSource,
    /throw new Error\('Implement SmokeBlock body rendering before shipping this block\.'\)/,
  );
  assert.match(testSource, /describeBlockContract\(/);
  assert.match(
    readFixtureFile(root, BLOCKS_RUNTIME_EXTENSIONS_PATH),
    /import \{ SmokeBlockRuntimeExtension \} from '\.\/SmokeBlock\/smoke-block-runtime-extension';/,
  );
  assert.match(
    readFixtureFile(root, BLOCKS_RUNTIME_EXTENSIONS_PATH),
    /SmokeBlockRuntimeExtension,/,
  );
  assert.match(
    readFixtureFile(root, BLOCKS_AUTHORING_EXTENSIONS_PATH),
    /import \{ SmokeBlockAuthoringExtension \} from '\.\/SmokeBlock\/smoke-block-authoring-extension';/,
  );
  assert.match(
    readFixtureFile(root, BLOCKS_AUTHORING_EXTENSIONS_PATH),
    /SmokeBlockAuthoringExtension,/,
  );
  assert.equal(
    countOccurrences(
      readFixtureFile(root, BUILT_IN_BLOCK_DEFINITIONS_PATH),
      "import { smokeBlockBlockDefinition } from './SmokeBlock/smoke-block-definition';",
    ),
    1,
  );
  assert.equal(
    countOccurrences(
      readFixtureFile(root, BUILT_IN_BLOCK_DEFINITIONS_PATH),
      "    smokeBlockBlockDefinition,",
    ),
    1,
  );
});

test(
  "assessment composite recipe writes current lane-safe assessment output",
  { timeout: 240_000 },
  (t) => {
    const root = createFixtureRoot(t);

    const result = runCreateBlock(["--name", "Demo", "--recipe", "assessment-composite"], root);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fixtureSourceFiles(root), [
      "packages/core/src/editor/blocks/Demo/Demo.test.ts",
      "packages/core/src/editor/blocks/Demo/Demo.tsx",
      "packages/core/src/editor/blocks/Demo/assessment.ts",
      "packages/core/src/editor/blocks/Demo/demo-authoring-extension.tsx",
      "packages/core/src/editor/blocks/Demo/demo-definition.ts",
      "packages/core/src/editor/blocks/Demo/demo-runtime-extension.tsx",
      "packages/core/src/editor/blocks/Demo/index.tsx",
      "packages/core/src/editor/blocks/Demo/node.ts",
      "packages/core/src/schemas/blocks/demo.ts",
    ]);
    assertAssessmentSettingsSchema(
      readFixtureFile(root, "packages/core/src/schemas/blocks/demo.ts"),
    );
    assert.match(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-definition.ts"),
      /insert: \{\n    id: DEMO_BLOCK_ID,/,
    );
    assert.match(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-definition.ts"),
      /from '@\/editor\/blocks\/block-definition'/,
    );
    assert.match(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-definition.ts"),
      /from '@\/editor\/configuration\/assessment-configuration'/,
    );
    assert.doesNotMatch(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/demo-definition.ts"),
      /defaults:|from '@\/editor\/registry'|host\/agent|editor\/configuration\/checked-settings/,
    );
    assert.match(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/assessment.ts"),
      /export function projectDemoAssessment\(_node: JSONContent\): AssessmentAnswerKey/,
    );
    assert.match(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/assessment.ts"),
      /throw new Error\('Implement Demo assessment projection before shipping this block\.'\)/,
    );
    assert.match(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/assessment.ts"),
      /throw new Error\('Implement Demo response presence check before shipping this block\.'\)/,
    );
    assertCurrentAssessmentTemplateSources(root);
    assertAssessmentNodeViewSource(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/Demo.tsx"),
    );
    assertAssessmentLaneExtensionSources(root);
    assert.match(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/Demo.test.ts"),
      /expectsAssessment: true/,
    );
    assertAssessmentRecipePassesWorkspaceChecks(t, "assessment-composite");
  },
);

test(
  "shell widget recipe writes current lane-safe assessment output with an atomic child canvas",
  { timeout: 240_000 },
  (t) => {
    const root = createFixtureRoot(t);

    const result = runCreateBlock(["--name", "Demo", "--recipe", "shell-widget"], root);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fixtureSourceFiles(root), [
      "packages/core/src/editor/blocks/Demo/Demo.test.ts",
      "packages/core/src/editor/blocks/Demo/Demo.tsx",
      "packages/core/src/editor/blocks/Demo/DemoCanvas.tsx",
      "packages/core/src/editor/blocks/Demo/assessment.ts",
      "packages/core/src/editor/blocks/Demo/demo-authoring-extension.tsx",
      "packages/core/src/editor/blocks/Demo/demo-definition.ts",
      "packages/core/src/editor/blocks/Demo/demo-runtime-extension.tsx",
      "packages/core/src/editor/blocks/Demo/index.tsx",
      "packages/core/src/editor/blocks/Demo/node.ts",
      "packages/core/src/schemas/blocks/demo.ts",
    ]);
    assertAssessmentSettingsSchema(
      readFixtureFile(root, "packages/core/src/schemas/blocks/demo.ts"),
    );
    assert.match(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/DemoCanvas.tsx"),
      /stableNodeIdAttribute\(\)/,
    );
    assert.match(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/DemoCanvas.tsx"),
      /atom: true/,
    );
    assert.doesNotMatch(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/node.ts"),
      /atom: true/,
    );
    assertCurrentAssessmentTemplateSources(root);
    assertAssessmentNodeViewSource(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/Demo.tsx"),
    );
    assertAssessmentLaneExtensionSources(root);
    assert.match(
      readFixtureFile(root, "packages/core/src/editor/blocks/Demo/Demo.test.ts"),
      /expectsAssessment: true/,
    );
    assertAssessmentRecipePassesWorkspaceChecks(t, "shell-widget");
  },
);

test("media widget recipe writes one visible widget node with structured data", (t) => {
  const root = createFixtureRoot(t);

  const result = runCreateBlock(["--name", "Demo", "--recipe", "media-widget"], root);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fixtureSourceFiles(root), [
    "packages/core/src/editor/blocks/Demo/Demo.test.ts",
    "packages/core/src/editor/blocks/Demo/Demo.tsx",
    "packages/core/src/editor/blocks/Demo/demo-authoring-extension.tsx",
    "packages/core/src/editor/blocks/Demo/demo-definition.ts",
    "packages/core/src/editor/blocks/Demo/demo-runtime-extension.tsx",
    "packages/core/src/editor/blocks/Demo/index.tsx",
    "packages/core/src/editor/blocks/Demo/node.ts",
    "packages/core/src/schemas/blocks/demo.ts",
  ]);
  assert.match(
    readFixtureFile(root, "packages/core/src/schemas/blocks/demo.ts"),
    /sourceUrl: z\.string\(\)\.url\(\)\.nullable\(\)\.default\(null\)/,
  );
  assert.match(readFixtureFile(root, "packages/core/src/editor/blocks/Demo/node.ts"), /data: \{/);
  assert.doesNotMatch(fixtureSourceFiles(root).join("\n"), /assessment\.ts|DemoCanvas\.tsx/);
});

test("updates the built-in definition list and both lane arrays exactly once", (t) => {
  const root = createFixtureRoot(t);

  const result = runCreateBlock(["--name", "Demo", "--recipe", "content"], root);

  assert.equal(result.status, 0, result.stderr);
  const builtInDefinitions = readFixtureFile(root, BUILT_IN_BLOCK_DEFINITIONS_PATH);
  const runtimeExtensions = readFixtureFile(root, BLOCKS_RUNTIME_EXTENSIONS_PATH);
  const authoringExtensions = readFixtureFile(root, BLOCKS_AUTHORING_EXTENSIONS_PATH);

  assert.equal(
    countOccurrences(
      builtInDefinitions,
      "import { demoBlockDefinition } from './Demo/demo-definition';",
    ),
    1,
  );
  assert.equal(countOccurrences(builtInDefinitions, "    demoBlockDefinition,"), 1);
  assert.equal(
    countOccurrences(
      runtimeExtensions,
      "import { DemoRuntimeExtension } from './Demo/demo-runtime-extension';",
    ),
    1,
  );
  assert.equal(countOccurrences(runtimeExtensions, "    DemoRuntimeExtension,"), 1);
  assert.equal(
    countOccurrences(
      authoringExtensions,
      "import { DemoAuthoringExtension } from './Demo/demo-authoring-extension';",
    ),
    1,
  );
  assert.equal(countOccurrences(authoringExtensions, "    DemoAuthoringExtension,"), 1);
});

test("shell widget updates all three explicit composition inputs", (t) => {
  const root = createFixtureRoot(t);

  const result = runCreateBlock(["--name", "Demo", "--recipe", "shell-widget"], root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    readFixtureFile(root, BLOCKS_RUNTIME_EXTENSIONS_PATH),
    /import \{ DemoRuntimeExtension \} from '\.\/Demo\/demo-runtime-extension';/,
  );
  assert.match(
    readFixtureFile(root, BLOCKS_AUTHORING_EXTENSIONS_PATH),
    /import \{ DemoAuthoringExtension \} from '\.\/Demo\/demo-authoring-extension';/,
  );
  assert.match(
    readFixtureFile(root, BUILT_IN_BLOCK_DEFINITIONS_PATH),
    /import \{ demoBlockDefinition \} from '\.\/Demo\/demo-definition';/,
  );
});

test("dry run reports extension array updates without writing files", (t) => {
  const root = createFixtureRoot(t);
  const originalBuiltInDefinitions = readFixtureFile(root, BUILT_IN_BLOCK_DEFINITIONS_PATH);
  const originalRuntimeEntry = readFixtureFile(root, BLOCKS_RUNTIME_EXTENSIONS_PATH);
  const originalAuthoringEntry = readFixtureFile(root, BLOCKS_AUTHORING_EXTENSIONS_PATH);

  const result = runCreateBlock(["--name", "Demo", "--recipe", "content", "--dry-run"], root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Would update:/);
  assert.match(result.stdout, new RegExp(escapeRegExp(BLOCKS_RUNTIME_EXTENSIONS_PATH)));
  assert.match(result.stdout, new RegExp(escapeRegExp(BLOCKS_AUTHORING_EXTENSIONS_PATH)));
  assert.match(result.stdout, new RegExp(escapeRegExp(BUILT_IN_BLOCK_DEFINITIONS_PATH)));
  assert.doesNotMatch(result.stdout, /createCourseDocument/);
  assert.equal(readFixtureFile(root, BUILT_IN_BLOCK_DEFINITIONS_PATH), originalBuiltInDefinitions);
  assert.equal(readFixtureFile(root, BLOCKS_RUNTIME_EXTENSIONS_PATH), originalRuntimeEntry);
  assert.equal(readFixtureFile(root, BLOCKS_AUTHORING_EXTENSIONS_PATH), originalAuthoringEntry);
  assert.equal(existsSync(join(root, "packages/core/src/editor/blocks/Demo/index.tsx")), false);
});

test("missing composition anchors fail before writing scaffold files", (t) => {
  const cases = [
    {
      path: BUILT_IN_BLOCK_DEFINITIONS_PATH,
      source: "export const nope = [];\n",
      error: /Could not find definition import anchor/,
    },
    {
      path: BLOCKS_RUNTIME_EXTENSIONS_PATH,
      source: "export {};\n",
      error: /Could not find import anchor.*runtime-block-extensions/s,
    },
    {
      path: BLOCKS_AUTHORING_EXTENSIONS_PATH,
      source: "export {};\n",
      error: /Could not find import anchor.*authoring-block-extensions/s,
    },
  ];

  for (const testCase of cases) {
    const root = createFixtureRoot(t);
    writeFixtureFile(root, testCase.path, testCase.source);

    const result = runCreateBlock(["--name", "Demo", "--recipe", "content"], root);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, testCase.error);
    assert.equal(existsSync(join(root, "packages/core/src/editor/blocks/Demo/index.tsx")), false);
  }
});

function createFixtureRoot(t, { seedRegistration = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "scaffold-create-block-"));
  if (seedRegistration) {
    writeFixtureFile(
      root,
      BUILT_IN_BLOCK_DEFINITIONS_PATH,
      [
        "import { calloutBlockDefinition } from './presentation/callout/callout-definition';",
        "import type { BlockDefinition } from './block-definition';",
        "",
        "export const builtInBlockDefinitions: readonly BlockDefinition[] = Object.freeze([",
        "    calloutBlockDefinition,",
        "]);",
        "",
      ].join("\n"),
    );
    writeFixtureFile(
      root,
      BLOCKS_RUNTIME_EXTENSIONS_PATH,
      [
        "import type { AnyExtension } from '@tiptap/core';",
        "import { CalloutRuntimeExtension } from './Callout/callout-runtime-extension';",
        "",
        "export function createRuntimeBlockExtensions(): readonly AnyExtension[] {",
        "  return [",
        "    CalloutRuntimeExtension,",
        "  ];",
        "}",
        "",
      ].join("\n"),
    );
    writeFixtureFile(
      root,
      BLOCKS_AUTHORING_EXTENSIONS_PATH,
      [
        "import type { AnyExtension } from '@tiptap/core';",
        "import { CalloutAuthoringExtension } from './Callout/callout-authoring-extension';",
        "",
        "export function createAuthoringBlockExtensions(): readonly AnyExtension[] {",
        "  return [",
        "    CalloutAuthoringExtension,",
        "  ];",
        "}",
        "",
      ].join("\n"),
    );
  }
  t.after(() => {
    rmSync(root, { force: true, recursive: true });
  });
  return root;
}

function writeFixtureFile(root, path, source) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source, "utf8");
}

function readFixtureFile(root, path) {
  return readFileSync(join(root, path), "utf8");
}

function assertFixtureFiles(root, paths) {
  for (const path of paths) {
    assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
  }
}

function assertAssessmentNodeViewSource(source) {
  assert.match(source, /AssessmentProblemContent/);
  assert.match(source, /editable=\{editable\}/);
  assert.match(source, /blockClass="sc-demo"/);
  assert.doesNotMatch(
    source,
    /NodeViewProps|props=\{props\}|AssessmentRuntimeProblemContent|useAssessmentRuntime|ShowAnswerButton|useEditorState/,
  );
}

function assertAssessmentLaneExtensionSources(root) {
  const authoringSource = readFixtureFile(
    root,
    "packages/core/src/editor/blocks/Demo/demo-authoring-extension.tsx",
  );
  const runtimeSource = readFixtureFile(
    root,
    "packages/core/src/editor/blocks/Demo/demo-runtime-extension.tsx",
  );

  assert.match(authoringSource, /import \{ DemoView \} from '\.\/Demo';/);
  assert.match(authoringSource, /function DemoAuthoringView\(\)/);
  assert.match(authoringSource, /<DemoView\s+editable\s+\/>/);
  assert.doesNotMatch(
    authoringSource,
    /NodeViewProps|props=\{props\}|AssessmentRuntimeProblemContent|useAssessmentRuntime/,
  );

  assert.match(
    runtimeSource,
    /import \{ AssessmentRuntimeProblemContent \} from '@\/editor\/blocks\/assessment\/shared\/runtime\/AssessmentRuntimeProblemContent';/,
  );
  assert.match(runtimeSource, /function DemoRuntimeView\(props: NodeViewProps\)/);
  assert.match(runtimeSource, /<AssessmentRuntimeProblemContent/);
  assert.match(runtimeSource, /blockClass="sc-demo"/);
  assert.match(runtimeSource, /definition=\{demoBlockDefinition\}/);
  assert.match(runtimeSource, /props=\{props\}/);
  assert.doesNotMatch(runtimeSource, /import \{ DemoView \} from '\.\/Demo';|<DemoView/);
}

function assertCurrentAssessmentTemplateSources(root) {
  const assessmentSource = readFixtureFile(
    root,
    "packages/core/src/editor/blocks/Demo/assessment.ts",
  );
  const definitionSource = readFixtureFile(
    root,
    "packages/core/src/editor/blocks/Demo/demo-definition.ts",
  );
  const testSource = readFixtureFile(root, "packages/core/src/editor/blocks/Demo/Demo.test.ts");

  assert.match(assessmentSource, /from '@scaffold\/contracts'/);
  assert.match(assessmentSource, /AssessmentCapabilityResponseDefinition<DemoResponse>/);
  assert.match(assessmentSource, /export const demoResponseCodec/);
  assert.match(definitionSource, /response: demoResponseCodec/);
  assert.match(definitionSource, /createStableId\(\)/);
  assert.match(testSource, /blockDefinitions: builtInBlockRegistry/);
  assert.match(
    testSource,
    /DemoSettingsSchema\.safeParse\(\{ unsupportedSetting: true \}\)\.success/,
  );
  assert.doesNotMatch(
    `${assessmentSource}\n${definitionSource}\n${testSource}`,
    /@\/schemas\/assessment|ProblemResponse|project: projectDemoResponse|createStableId\('[^']+'\)|stableIdPrefix/,
  );
}

function assertAssessmentRecipePassesWorkspaceChecks(t, recipe) {
  const scratch = mkdtempSync(join(tmpdir(), `scaffold-create-block-${recipe}-checkout-`));
  const root = join(scratch, "scaffold");
  t.after(() => rmSync(scratch, { force: true, recursive: true }));

  const cloneResult = spawnSync("git", ["clone", "--shared", REPO_ROOT, root], {
    encoding: "utf8",
  });
  assert.equal(cloneResult.status, 0, cloneResult.stderr);

  const result = runCreateBlock(["--name", "Generated Assessment Probe", "--recipe", recipe], root);
  assert.equal(result.status, 0, result.stderr);

  const installResult = runVp(["install", "--ignore-scripts"], root);
  assert.equal(installResult.status, 0, installResult.stderr || installResult.stdout);
  for (const dependency of ["@scaffold/contracts", "@scaffold/grading"]) {
    const dependencyBuildResult = runVp(["run", `${dependency}#build`], root);
    assert.equal(
      dependencyBuildResult.status,
      0,
      `${dependencyBuildResult.stdout}\n${dependencyBuildResult.stderr}`,
    );
  }
  const buildResult = runVp(["run", "@scaffold/core#build"], root);
  assert.equal(buildResult.status, 0, `${buildResult.stdout}\n${buildResult.stderr}`);
  const typeResult = runVp(["run", "verify:types"], root);
  const typeLogPath = join(root, ".tmp/vp-verify-types.log");
  const typeLog = existsSync(typeLogPath) ? readFileSync(typeLogPath, "utf8") : "";
  assert.equal(typeResult.status, 0, `${typeResult.stdout}\n${typeResult.stderr}\n${typeLog}`);
  const contractResult = runInstalledVp(
    [
      "run",
      "@scaffold/core#test",
      "src/editor/blocks/GeneratedAssessmentProbe/GeneratedAssessmentProbe.test.ts",
    ],
    root,
  );
  assert.equal(contractResult.status, 0, `${contractResult.stdout}\n${contractResult.stderr}`);
  const settingsProbeResult = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
      `import { GeneratedAssessmentProbeSettingsSchema } from './packages/core/src/schemas/blocks/generated-assessment-probe.ts';
if (GeneratedAssessmentProbeSettingsSchema.safeParse({ unsupportedSetting: true }).success) {
  throw new Error('generated assessment settings accepted an unsupported key');
}`,
    ],
    { cwd: root, encoding: "utf8", env: process.env },
  );
  assert.equal(
    settingsProbeResult.status,
    0,
    `${settingsProbeResult.stdout}\n${settingsProbeResult.stderr}`,
  );
}

function assertAssessmentSettingsSchema(source) {
  assert.match(source, /import \{ AssessmentCommonSettingsSchema \} from '@scaffold\/contracts';/);
  assert.match(source, /SettingsSchema = AssessmentCommonSettingsSchema\.extend\(\{/);
  assert.match(
    source,
    /maxAttempts: z\.number\(\)\.int\(\)\.min\(1\)\.nullable\(\)\.default\(null\)/,
  );
  assert.doesNotMatch(source, /\b(?:feedbackMode|isGraded|showAnswer)\s*:/);
}

function fixtureSourceFiles(root) {
  const files = [];
  collectFixtureFiles(root, root, files);
  return files.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function collectFixtureFiles(root, current, files) {
  for (const entry of readdirSync(current)) {
    const file = join(current, entry);
    const stats = statSync(file);
    if (stats.isDirectory()) {
      collectFixtureFiles(root, file, files);
      continue;
    }
    const path = file.slice(root.length + 1);
    if (!BLOCK_REGISTRATION_FIXTURE_FILES.has(path)) {
      files.push(path);
    }
  }
}

function countOccurrences(value, search) {
  return value.split(search).length - 1;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runCreateBlock(args, root = REPO_ROOT) {
  return spawnSync(process.execPath, [join(REPO_ROOT, "scripts/create-block.mjs"), ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      SCAFFOLD_ROOT: root,
    },
  });
}

function runVp(args, cwd) {
  return spawnSync("vp", args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

function runInstalledVp(args, cwd) {
  return spawnSync(join(cwd, "node_modules/.bin/vp"), args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}
