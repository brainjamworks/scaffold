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
const BUILT_IN_LAYOUT_DEFINITIONS_PATH =
  "packages/core/src/editor/arrangements/layout/model/built-in-layout-definitions.ts";
const LAYOUT_AUTHORING_VIEWS_PATH =
  "packages/core/src/editor/arrangements/layout/authoring/built-in-layout-views.ts";
const LAYOUT_RUNTIME_VIEWS_PATH =
  "packages/core/src/editor/arrangements/layout/runtime/built-in-layout-views.ts";

test("dry run prints the layout files it would write", () => {
  const result = runCreateLayout(demoLayoutArgs("--dry-run"));

  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /packages\/core\/src\/editor\/arrangements\/layout\/demo\/demo-definition\.tsx/,
  );
  assert.match(
    result.stdout,
    /packages\/core\/src\/editor\/arrangements\/layout\/demo\/demo-runtime-views\.tsx/,
  );
  assert.match(result.stdout, /built-in-layout-definitions\.ts/);
  assert.match(result.stdout, /authoring\/built-in-layout-views\.ts/);
  assert.match(result.stdout, /runtime\/built-in-layout-views\.ts/);
});

test("rejects missing layout name", () => {
  const result = runCreateLayout(["--dry-run"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--name is required/);
});

test("rejects missing section label", () => {
  const result = runCreateLayout(["--name", "Demo", "--add-label", "Add section", "--dry-run"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--section-label is required/);
});

test("rejects missing add label", () => {
  const result = runCreateLayout(["--name", "Demo", "--section-label", "Section", "--dry-run"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--add-label is required/);
});

test("refuses to overwrite existing layout files", (t) => {
  const root = createFixtureRoot(t);
  writeFixtureFile(
    root,
    "packages/core/src/editor/arrangements/layout/demo/demo-definition.tsx",
    "export {};\n",
  );

  const result = runCreateLayout(demoLayoutArgs(), root);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to overwrite/);
  assert.match(
    result.stderr,
    /packages\/core\/src\/editor\/arrangements\/layout\/demo\/demo-definition\.tsx/,
  );
});

test("accepts section and add labels", (t) => {
  const root = createFixtureRoot(t);

  const result = runCreateLayout(
    ["--name", "Demo", "--section-label", "Step", "--add-label", "Add step", "--dry-run"],
    root,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /section label: Step/);
  assert.match(result.stdout, /add label: Add step/);
  assert.equal(
    existsSync(join(root, "packages/core/src/editor/arrangements/layout/demo/demo-definition.tsx")),
    false,
  );
});

test("layout recipe writes definition, content, views, and contract test", (t) => {
  const root = createFixtureRoot(t);

  const result = runCreateLayout(demoLayoutArgs(), root);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fixtureSourceFiles(root), [
    "packages/core/src/editor/arrangements/layout/demo/demo-content.ts",
    "packages/core/src/editor/arrangements/layout/demo/demo-definition.tsx",
    "packages/core/src/editor/arrangements/layout/demo/demo-runtime-views.tsx",
    "packages/core/src/editor/arrangements/layout/demo/demo-views.tsx",
    "packages/core/src/editor/arrangements/layout/demo/demo.test.ts",
  ]);
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/arrangements/layout/demo/demo-definition.tsx"),
    /satisfies LayoutDefinition/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/arrangements/layout/demo/demo-definition.tsx"),
    /defineConfiguration\(/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/arrangements/layout/demo/demo-definition.tsx"),
    /import \{ defineConfiguration \} from '@\/editor\/configuration\/definition';/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/arrangements/layout/demo/demo-definition.tsx"),
    /import type \{ LayoutDefinition \} from '\.\.\/model\/layout-definition';/,
  );
  assert.doesNotMatch(
    readFixtureFile(root, "packages/core/src/editor/arrangements/layout/demo/demo-definition.tsx"),
    /component:|sectionComponent:/,
  );
  assert.doesNotMatch(
    readFixtureFile(root, "packages/core/src/editor/arrangements/layout/demo/demo-definition.tsx"),
    /@\/editor\/registry\/contributions/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/arrangements/layout/demo/demo-content.ts"),
    /variant: 'demo'/,
  );
  assert.doesNotMatch(
    readFixtureFile(root, "packages/core/src/editor/arrangements/layout/demo/demo-content.ts"),
    /kind: 'demo'/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/arrangements/layout/demo/demo-content.ts"),
    /createStableId\(\)/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/arrangements/layout/demo/demo-content.ts"),
    /createStableId\(\)/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/arrangements/layout/demo/demo-content.ts"),
    /createDemoSection\(0, 'Section 1'\)/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/arrangements/layout/demo/demo-content.ts"),
    /role: 'demo-section'/,
  );
  assert.match(
    readFixtureFile(root, "packages/core/src/editor/arrangements/layout/demo/demo.test.ts"),
    /describeLayoutContract\(/,
  );
  const runtimeViewSource = readFixtureFile(
    root,
    "packages/core/src/editor/arrangements/layout/demo/demo-runtime-views.tsx",
  );
  assert.match(runtimeViewSource, /DemoLayoutRuntimeView/);
  assert.match(runtimeViewSource, /DemoSectionRuntimeView/);
  assert.doesNotMatch(runtimeViewSource, /LayoutAddGhost/);
  assert.doesNotMatch(runtimeViewSource, /structuralAuthoringFrameAttributes/);
});

test("layout recipe scaffold works end to end in a temp root", (t) => {
  const root = createFixtureRoot(t);

  const result = runCreateLayout(
    ["--name", "Smoke Layout", "--section-label", "Milestone", "--add-label", "Add milestone"],
    root,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fixtureSourceFiles(root), [
    "packages/core/src/editor/arrangements/layout/smoke-layout/smoke-layout-content.ts",
    "packages/core/src/editor/arrangements/layout/smoke-layout/smoke-layout-definition.tsx",
    "packages/core/src/editor/arrangements/layout/smoke-layout/smoke-layout-runtime-views.tsx",
    "packages/core/src/editor/arrangements/layout/smoke-layout/smoke-layout-views.tsx",
    "packages/core/src/editor/arrangements/layout/smoke-layout/smoke-layout.test.ts",
  ]);

  const definitionSource = readFixtureFile(
    root,
    "packages/core/src/editor/arrangements/layout/smoke-layout/smoke-layout-definition.tsx",
  );
  const contentSource = readFixtureFile(
    root,
    "packages/core/src/editor/arrangements/layout/smoke-layout/smoke-layout-content.ts",
  );
  const viewSource = readFixtureFile(
    root,
    "packages/core/src/editor/arrangements/layout/smoke-layout/smoke-layout-views.tsx",
  );
  const runtimeViewSource = readFixtureFile(
    root,
    "packages/core/src/editor/arrangements/layout/smoke-layout/smoke-layout-runtime-views.tsx",
  );
  const testSource = readFixtureFile(
    root,
    "packages/core/src/editor/arrangements/layout/smoke-layout/smoke-layout.test.ts",
  );

  assert.match(definitionSource, /satisfies LayoutDefinition/);
  assert.match(definitionSource, /defineConfiguration\(/);
  assert.match(contentSource, /createStableId\(\)/);
  assert.match(contentSource, /createSmokeLayoutSection\(0, 'Milestone 1'\)/);
  assert.match(viewSource, /LayoutAddGhost/);
  assert.match(viewSource, /SectionMovementHandle/);
  assert.match(viewSource, /SectionActionTrigger/);
  assert.match(viewSource, /Add milestone/);
  assert.match(runtimeViewSource, /SmokeLayoutLayoutRuntimeView/);
  assert.match(runtimeViewSource, /SmokeLayoutSectionRuntimeView/);
  assert.doesNotMatch(runtimeViewSource, /props\.editable/);
  assert.doesNotMatch(runtimeViewSource, /LayoutMenuTrigger/);
  assert.match(
    viewSource,
    /throw new Error\('Implement SmokeLayout section label rendering before shipping this layout\.'\)/,
  );
  assert.match(testSource, /describeLayoutContract\(/);
  assert.match(testSource, /layoutDefinitions: builtInLayoutRegistry/);
  assert.match(testSource, /layoutAuthoringViews: builtInLayoutAuthoringViewRegistry/);
  assert.match(readFixtureFile(root, BUILT_IN_LAYOUT_DEFINITIONS_PATH), /smokeLayoutDefinition/);
  assert.match(readFixtureFile(root, LAYOUT_AUTHORING_VIEWS_PATH), /SmokeLayoutLayoutView/);
  assert.match(readFixtureFile(root, LAYOUT_RUNTIME_VIEWS_PATH), /SmokeLayoutLayoutRuntimeView/);
  assert.match(readFixtureFile(root, LAYOUT_AUTHORING_VIEWS_PATH), /id: 'smoke-layout'/);
  assert.match(readFixtureFile(root, LAYOUT_RUNTIME_VIEWS_PATH), /id: 'smoke-layout'/);
});

test("layout view wires current authoring chrome slots", (t) => {
  const root = createFixtureRoot(t);

  const result = runCreateLayout(
    ["--name", "Demo", "--section-label", "Step", "--add-label", "Add step"],
    root,
  );

  assert.equal(result.status, 0, result.stderr);
  const viewSource = readFixtureFile(
    root,
    "packages/core/src/editor/arrangements/layout/demo/demo-views.tsx",
  );
  assert.match(viewSource, /LayoutAddGhost/);
  assert.match(viewSource, /SectionMovementHandle/);
  assert.match(viewSource, /SectionActionTrigger/);
  assert.match(viewSource, /Add step/);
  assert.match(viewSource, /blockDefinitions=\{props\.blockDefinitions\}/);
  assert.doesNotMatch(viewSource, /builtInBlockRegistry/);
  assert.match(
    viewSource,
    /throw new Error\('Implement Demo section label rendering before shipping this layout\.'\)/,
  );
  assert.doesNotMatch(viewSource, /LayoutOutlineChrome|LayoutMenuTrigger/);
  assert.doesNotMatch(viewSource, /data-section-outline/);
});

test("updates the definition and both lane catalogs exactly once", (t) => {
  const root = createFixtureRoot(t);

  const result = runCreateLayout(demoLayoutArgs(), root);

  assert.equal(result.status, 0, result.stderr);
  const definitionCatalog = readFixtureFile(root, BUILT_IN_LAYOUT_DEFINITIONS_PATH);
  const authoringCatalog = readFixtureFile(root, LAYOUT_AUTHORING_VIEWS_PATH);
  const runtimeCatalog = readFixtureFile(root, LAYOUT_RUNTIME_VIEWS_PATH);

  assert.equal(countOccurrences(definitionCatalog, "../demo/demo-definition"), 1);
  assert.equal(countOccurrences(definitionCatalog, "  demoLayoutDefinition,"), 1);
  assert.equal(countOccurrences(authoringCatalog, "../demo/demo-views"), 1);
  assert.equal(countOccurrences(authoringCatalog, "id: 'demo'"), 1);
  assert.equal(countOccurrences(runtimeCatalog, "../demo/demo-runtime-views"), 1);
  assert.equal(countOccurrences(runtimeCatalog, "id: 'demo'"), 1);
  assert.ok(
    definitionCatalog.indexOf("accordionLayoutDefinition") <
      definitionCatalog.indexOf("demoLayoutDefinition"),
  );
  assert.ok(
    definitionCatalog.indexOf("demoLayoutDefinition") <
      definitionCatalog.indexOf("tabsLayoutDefinition"),
  );
});

for (const catalog of [
  {
    arrayName: "builtInLayoutDefinitions",
    duplicateNeedle: "  tabsLayoutDefinition,",
    duplicateReplacement: "  demoLayoutDefinition,\n  tabsLayoutDefinition,",
    label: "neutral definition",
    path: BUILT_IN_LAYOUT_DEFINITIONS_PATH,
  },
  {
    arrayName: "builtInLayoutAuthoringViews",
    duplicateNeedle: "    id: 'tabs',",
    duplicateReplacement: "    id: 'demo',",
    label: "authoring view",
    path: LAYOUT_AUTHORING_VIEWS_PATH,
  },
  {
    arrayName: "builtInLayoutRuntimeViews",
    duplicateNeedle: "    id: 'tabs',",
    duplicateReplacement: "    id: 'demo',",
    label: "runtime view",
    path: LAYOUT_RUNTIME_VIEWS_PATH,
  },
]) {
  test(`rejects a ${catalog.label} catalog missing its canonical array without writing`, (t) => {
    const root = createFixtureRoot(t);
    const source = readFixtureFile(root, catalog.path);
    writeFixtureFile(
      root,
      catalog.path,
      source.replace(catalog.arrayName, `${catalog.arrayName}Old`),
    );
    const originals = snapshotCatalogs(root);

    const result = runCreateLayout(demoLayoutArgs(), root);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(catalog.arrayName));
    assertGeneratorFailureIsAtomic(root, originals);
  });

  test(`rejects a duplicate ID in the ${catalog.label} catalog without writing`, (t) => {
    const root = createFixtureRoot(t);
    const source = readFixtureFile(root, catalog.path);
    assert.ok(source.includes(catalog.duplicateNeedle));
    writeFixtureFile(
      root,
      catalog.path,
      source.replace(catalog.duplicateNeedle, catalog.duplicateReplacement),
    );
    const originals = snapshotCatalogs(root);

    const result = runCreateLayout(demoLayoutArgs(), root);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /already contains layout ID "demo"/);
    assertGeneratorFailureIsAtomic(root, originals);
  });
}

test("produces deterministic scaffold and catalog output", (t) => {
  const firstRoot = createFixtureRoot(t);
  const secondRoot = createFixtureRoot(t);

  const firstResult = runCreateLayout(demoLayoutArgs(), firstRoot);
  const secondResult = runCreateLayout(demoLayoutArgs(), secondRoot);

  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.equal(secondResult.status, 0, secondResult.stderr);
  assert.deepEqual(fixtureSourceFiles(firstRoot), fixtureSourceFiles(secondRoot));
  for (const path of fixtureSourceFiles(firstRoot)) {
    assert.equal(readFixtureFile(firstRoot, path), readFixtureFile(secondRoot, path), path);
  }
  for (const path of [
    BUILT_IN_LAYOUT_DEFINITIONS_PATH,
    LAYOUT_AUTHORING_VIEWS_PATH,
    LAYOUT_RUNTIME_VIEWS_PATH,
  ]) {
    assert.equal(readFixtureFile(firstRoot, path), readFixtureFile(secondRoot, path), path);
  }
});

test("dry run reports all catalog updates without writing them", (t) => {
  const root = createFixtureRoot(t);
  const originals = new Map(
    [BUILT_IN_LAYOUT_DEFINITIONS_PATH, LAYOUT_AUTHORING_VIEWS_PATH, LAYOUT_RUNTIME_VIEWS_PATH].map(
      (path) => [path, readFixtureFile(root, path)],
    ),
  );

  const result = runCreateLayout(demoLayoutArgs("--dry-run"), root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Would update:/);
  assert.match(result.stdout, /built-in-layout-definitions\.ts/);
  assert.match(result.stdout, /authoring\/built-in-layout-views\.ts/);
  assert.match(result.stdout, /runtime\/built-in-layout-views\.ts/);
  for (const [path, source] of originals) {
    assert.equal(readFixtureFile(root, path), source);
  }
  assert.equal(fixtureLayoutExists(root, "demo"), false);
});

function createFixtureRoot(t) {
  const root = mkdtempSync(join(tmpdir(), "scaffold-create-layout-"));
  writeFixtureFile(
    root,
    BUILT_IN_LAYOUT_DEFINITIONS_PATH,
    [
      "import { accordionLayoutDefinition } from '../accordion/accordion-definition';",
      "import { tabsLayoutDefinition } from '../tabs/tabs-definition';",
      "import type { LayoutDefinition } from './layout-definition';",
      "import { createLayoutRegistry } from './layout-registry';",
      "",
      "export const builtInLayoutDefinitions = Object.freeze([",
      "  accordionLayoutDefinition,",
      "  tabsLayoutDefinition,",
      "]);",
      "",
      "export const builtInLayoutRegistry = createLayoutRegistry(builtInLayoutDefinitions);",
      "",
    ].join("\n"),
  );
  writeFixtureFile(
    root,
    LAYOUT_AUTHORING_VIEWS_PATH,
    [
      "import { builtInLayoutRegistry } from '../model/built-in-layout-definitions';",
      "import { AccordionLayoutView, AccordionSectionView } from '../accordion/accordion-views';",
      "import { TabsLayoutView, TabsSectionView } from '../tabs/tabs-views';",
      "import type { LayoutViewRegistration } from './layout-view-definition';",
      "import { createLayoutAuthoringViewRegistry } from './layout-view-registry';",
      "",
      "export const builtInLayoutAuthoringViews = Object.freeze([",
      "  {",
      "    id: 'accordion',",
      "    layout: AccordionLayoutView,",
      "    section: AccordionSectionView,",
      "  },",
      "  {",
      "    id: 'tabs',",
      "    layout: TabsLayoutView,",
      "    section: TabsSectionView,",
      "  },",
      "] as const satisfies readonly LayoutViewRegistration[]);",
      "",
      "export const builtInLayoutAuthoringViewRegistry = createLayoutAuthoringViewRegistry(",
      "  builtInLayoutRegistry,",
      "  builtInLayoutAuthoringViews,",
      ");",
      "",
    ].join("\n"),
  );
  writeFixtureFile(
    root,
    LAYOUT_RUNTIME_VIEWS_PATH,
    [
      "import { builtInLayoutRegistry } from '../model/built-in-layout-definitions';",
      "import { AccordionLayoutRuntimeView, AccordionSectionRuntimeView } from '../accordion/accordion-runtime-views';",
      "import { TabsLayoutRuntimeView, TabsSectionRuntimeView } from '../tabs/tabs-runtime-views';",
      "import type { LayoutRuntimeViewRegistration } from './layout-view-definition';",
      "import { createLayoutRuntimeViewRegistry } from './layout-view-registry';",
      "",
      "export const builtInLayoutRuntimeViews = Object.freeze([",
      "  {",
      "    id: 'accordion',",
      "    component: AccordionLayoutRuntimeView,",
      "    sectionComponent: AccordionSectionRuntimeView,",
      "  },",
      "  {",
      "    id: 'tabs',",
      "    component: TabsLayoutRuntimeView,",
      "    sectionComponent: TabsSectionRuntimeView,",
      "  },",
      "] as const satisfies readonly LayoutRuntimeViewRegistration[]);",
      "",
      "export const builtInLayoutRuntimeViewRegistry = createLayoutRuntimeViewRegistry(",
      "  builtInLayoutRegistry,",
      "  builtInLayoutRuntimeViews,",
      ");",
      "",
    ].join("\n"),
  );
  t.after(() => {
    rmSync(root, { force: true, recursive: true });
  });
  return root;
}

function demoLayoutArgs(...extra) {
  return ["--name", "Demo", "--section-label", "Section", "--add-label", "Add section", ...extra];
}

function writeFixtureFile(root, path, source) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source, "utf8");
}

function readFixtureFile(root, path) {
  return readFileSync(join(root, path), "utf8");
}

function fixtureSourceFiles(root) {
  const files = [];
  collectFixtureFiles(root, root, files);
  return files.sort((a, b) => a.localeCompare(b));
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
    if (
      path !== BUILT_IN_LAYOUT_DEFINITIONS_PATH &&
      path !== LAYOUT_AUTHORING_VIEWS_PATH &&
      path !== LAYOUT_RUNTIME_VIEWS_PATH
    ) {
      files.push(path);
    }
  }
}

function countOccurrences(value, search) {
  return value.split(search).length - 1;
}

function fixtureLayoutExists(root, layoutId) {
  return existsSync(join(root, `packages/core/src/editor/arrangements/layout/${layoutId}`));
}

function snapshotCatalogs(root) {
  return new Map(
    [BUILT_IN_LAYOUT_DEFINITIONS_PATH, LAYOUT_AUTHORING_VIEWS_PATH, LAYOUT_RUNTIME_VIEWS_PATH].map(
      (path) => [path, readFixtureFile(root, path)],
    ),
  );
}

function assertGeneratorFailureIsAtomic(root, originals) {
  assert.equal(fixtureLayoutExists(root, "demo"), false);
  for (const [path, source] of originals) {
    assert.equal(readFixtureFile(root, path), source, path);
  }
}

function runCreateLayout(args, root = REPO_ROOT) {
  return spawnSync(process.execPath, [join(REPO_ROOT, "scripts/create-layout.mjs"), ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      SCAFFOLD_ROOT: root,
    },
  });
}
