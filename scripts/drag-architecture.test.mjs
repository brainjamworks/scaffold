import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreSourceRoot = path.join(repositoryRoot, "packages/core/src");
const centralReactAdapter = "packages/core/src/editor/interactions/drag/react/";

const retiredPaths = [
  "packages/core/src/editor/drag",
  "packages/core/src/editor/blocks/assessment/shared/runtime/runtime-dnd.tsx",
  "packages/core/src/editor/blocks/assessment/shared/runtime/runtime-dnd.css",
];

test("retired drag architecture paths remain deleted", async () => {
  for (const retiredPath of retiredPaths) {
    await assert.rejects(
      access(path.join(repositoryRoot, retiredPath)),
      (error) => error instanceof Error && "code" in error && error.code === "ENOENT",
      `${retiredPath} must remain deleted`,
    );
  }
});

test("production Core imports only the central drag adapter and no retired path", async () => {
  const sourceFiles = await listProductionSourceFiles(coreSourceRoot);
  const oldPathReferences = [];
  const dndKitImportsOutsideAdapter = [];

  for (const absolutePath of sourceFiles) {
    const relativePath = path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
    const contents = await readFile(absolutePath, "utf8");
    if (contents.includes("editor/drag") || contents.includes("runtime-dnd")) {
      oldPathReferences.push(relativePath);
    }
    if (!relativePath.startsWith(centralReactAdapter) && contents.includes("@dnd-kit/")) {
      dndKitImportsOutsideAdapter.push(relativePath);
    }
  }

  assert.deepEqual(oldPathReferences, [], "retired drag import strings must not return");
  assert.deepEqual(
    dndKitImportsOutsideAdapter,
    [],
    "production dnd-kit imports belong only to editor/interactions/drag/react",
  );
});

async function listProductionSourceFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["__tests__", "fixtures", "testing"].includes(entry.name)) continue;
      files.push(...(await listProductionSourceFiles(absolutePath)));
      continue;
    }
    if (!entry.isFile() || !/\.(?:c|m)?(?:j|t)sx?$/.test(entry.name)) continue;
    if (/\.(?:browser\.)?(?:test|spec)\.[^.]+$/.test(entry.name)) continue;
    files.push(absolutePath);
  }
  return files.sort((left, right) => left.localeCompare(right));
}
