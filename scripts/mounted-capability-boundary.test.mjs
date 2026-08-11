import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import test from "node:test";

import ts from "typescript";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(repositoryRoot, "packages/core/src");

// Core construction owners may assemble built-in definitions. The Grid/Layout
// node modules also retain isolated-test aliases, but those alias names are
// rejected from every production consumer below.
const allowedBuiltInImports = new Map([
  [
    "packages/core/src/editor/arrangements/grid/authoring/grid-nodes.tsx",
    new Set(["builtInBlockRegistry"]),
  ],
  [
    "packages/core/src/editor/arrangements/layout/authoring/layout-nodes.tsx",
    new Set([
      "builtInBlockRegistry",
      "builtInLayoutAuthoringViewRegistry",
      "builtInLayoutRegistry",
    ]),
  ],
  [
    "packages/core/src/editor/arrangements/layout/authoring/built-in-layout-views.ts",
    new Set(["builtInLayoutRegistry"]),
  ],
  [
    "packages/core/src/editor/arrangements/layout/runtime/layout-nodes.ts",
    new Set(["builtInLayoutRegistry", "builtInLayoutRuntimeViewRegistry"]),
  ],
  [
    "packages/core/src/editor/arrangements/layout/runtime/built-in-layout-views.ts",
    new Set(["builtInLayoutRegistry"]),
  ],
  [
    "packages/core/src/editor/surfaces/authoring/surface-authoring-views.ts",
    new Set(["builtInSurfaceVariantRegistry"]),
  ],
  [
    "packages/core/src/editor/surfaces/runtime/surface-runtime-views.ts",
    new Set(["builtInSurfaceVariantRegistry"]),
  ],
  ["packages/core/src/format/artifact.ts", new Set(["builtInSurfaceVariantRegistry"])],
]);

const testFixtureAliases = new Set([
  "CellAuthoringNode",
  "GridAuthoringNode",
  "LayoutAuthoringNode",
  "LayoutRuntimeNode",
  "SectionAuthoringNode",
  "SectionRuntimeNode",
]);

test("mounted Core consumers do not import built-in capability fallbacks", async () => {
  const violations = [];

  for (const file of await listProductionTypeScriptFiles(sourceRoot)) {
    const repositoryPath = relative(repositoryRoot, file).split(sep).join("/");
    const allowed = allowedBuiltInImports.get(repositoryPath) ?? new Set();
    const source = await readFile(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;

      for (const element of bindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        const isBuiltInLookup =
          /^builtIn(?:Block|Layout|Surface).*(?:Registry|ViewMap|ChromeResolver)$/.test(
            importedName,
          );
        const isTestFixtureAlias = testFixtureAliases.has(importedName);
        if ((!isBuiltInLookup && !isTestFixtureAlias) || allowed.has(importedName)) continue;

        const { line } = sourceFile.getLineAndCharacterOfPosition(element.getStart(sourceFile));
        violations.push(`${repositoryPath}:${line + 1} imports ${importedName}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

async function listProductionTypeScriptFiles(directory) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "testing" || entry.name === "tests") continue;
      files.push(...(await listProductionTypeScriptFiles(path)));
      continue;
    }
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    if (/\.(?:browser\.)?test\.tsx?$/.test(entry.name)) continue;
    files.push(path);
  }

  return files;
}
