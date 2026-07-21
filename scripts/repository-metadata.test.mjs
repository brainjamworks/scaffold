import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import ts from "typescript";
import { loadConfigFromFile } from "vite";
import { parse as parseYaml } from "yaml";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CORE_SOURCE_ROOT = resolve(REPOSITORY_ROOT, "packages/core/src");
const PRIVATE_AGENT_PACKAGE = "@scaffold/agent";
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(REPOSITORY_ROOT, relativePath), "utf8"));
}

async function readWorkspaceManifests() {
  const workspace = parseYaml(
    await readFile(resolve(REPOSITORY_ROOT, "pnpm-workspace.yaml"), "utf8"),
  );
  assert.ok(Array.isArray(workspace.packages), "pnpm-workspace.yaml packages must be an array");

  const manifestPaths = ts.sys.readDirectory(
    REPOSITORY_ROOT,
    [".json"],
    undefined,
    workspace.packages.map((pattern) => `${pattern}/package.json`),
  );
  assert.ok(manifestPaths.length > 0, "workspace package globs must discover manifests");

  return Promise.all(
    manifestPaths.map(async (manifestPath) => ({
      manifest: JSON.parse(await readFile(manifestPath, "utf8")),
      relativePath: relative(REPOSITORY_ROOT, manifestPath),
    })),
  );
}

function declaredDependencyNames(manifest) {
  return DEPENDENCY_SECTIONS.flatMap((section) => Object.keys(manifest[section] ?? {}));
}

function scaffoldDependencyNames(manifest) {
  return declaredDependencyNames(manifest)
    .filter((name) => name.startsWith("@scaffold/"))
    .sort();
}

function manifestNamed(records, name) {
  const record = records.find(({ manifest }) => manifest.name === name);
  assert.ok(record, `workspace must contain ${name}`);
  return record.manifest;
}

function parseTypeScriptConfig(relativePath) {
  const configPath = resolve(REPOSITORY_ROOT, relativePath);
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) {
    assert.fail(
      `${relativePath}: ${ts.flattenDiagnosticMessageText(readResult.error.messageText, "\n")}`,
    );
  }

  const parsed = ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    dirname(configPath),
    undefined,
    configPath,
  );
  assert.equal(
    parsed.errors.length,
    0,
    `${relativePath}: ${ts.formatDiagnostics(parsed.errors, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => REPOSITORY_ROOT,
      getNewLine: () => "\n",
    })}`,
  );
  return parsed;
}

function isPathInside(parentPath, candidatePath) {
  const relationship = relative(parentPath, candidatePath);
  return (
    relationship === "" ||
    (relationship !== ".." && !relationship.startsWith(`..${sep}`) && !isAbsolute(relationship))
  );
}

function aliasEntries(alias) {
  if (!alias) return [];
  if (Array.isArray(alias)) {
    return alias.map(({ find, replacement }) => ({ find: String(find), replacement }));
  }
  return Object.entries(alias).map(([find, replacement]) => ({ find, replacement }));
}

async function loadViteConfig(relativePath) {
  const configPath = resolve(REPOSITORY_ROOT, relativePath);
  const loaded = await loadConfigFromFile(
    { command: "build", mode: "test", isSsrBuild: false, isPreview: false },
    configPath,
    dirname(configPath),
  );
  assert.ok(loaded, `${relativePath} must load through Vite`);
  return loaded.config;
}

test("root owns the exact YAML parser version used by repository metadata validation", async () => {
  const rootManifest = await readJson("package.json");
  assert.equal(rootManifest.devDependencies?.yaml, "2.9.0", "root devDependencies.yaml");
});

test("workspace manifests declare the selected Scaffold package DAG", async () => {
  const records = await readWorkspaceManifests();

  assert.deepEqual(scaffoldDependencyNames(manifestNamed(records, "@scaffold/contracts")), []);
  assert.deepEqual(scaffoldDependencyNames(manifestNamed(records, "@scaffold/grading")), [
    "@scaffold/contracts",
  ]);
  assert.deepEqual(scaffoldDependencyNames(manifestNamed(records, "@scaffold/core")), [
    "@scaffold/contracts",
  ]);
  assert.deepEqual(scaffoldDependencyNames(manifestNamed(records, "@scaffold/playground")), [
    "@scaffold/contracts",
    "@scaffold/core",
    "@scaffold/grading",
  ]);

  const adapters = records.filter(({ relativePath }) => relativePath.startsWith("adapters/"));
  assert.ok(adapters.length > 0, "workspace package globs must discover public adapters");
  for (const { manifest, relativePath } of adapters) {
    assert.deepEqual(
      scaffoldDependencyNames(manifest),
      ["@scaffold/contracts", "@scaffold/core"],
      `${relativePath} Scaffold dependencies`,
    );
  }
});

test("public manifests and lock metadata contain no private Agent package", async () => {
  const records = [
    { manifest: await readJson("package.json"), relativePath: "package.json" },
    ...(await readWorkspaceManifests()),
  ];

  for (const { manifest, relativePath } of records) {
    assert.notEqual(manifest.name, PRIVATE_AGENT_PACKAGE, `${relativePath} package name`);
    for (const section of DEPENDENCY_SECTIONS) {
      assert.equal(
        Object.hasOwn(manifest[section] ?? {}, PRIVATE_AGENT_PACKAGE),
        false,
        `${relativePath} ${section}.${PRIVATE_AGENT_PACKAGE}`,
      );
    }
  }

  const lock = parseYaml(await readFile(resolve(REPOSITORY_ROOT, "pnpm-lock.yaml"), "utf8"));
  for (const section of ["importers", "packages", "snapshots"]) {
    assert.ok(
      lock[section] && typeof lock[section] === "object",
      `lock ${section} must be an object`,
    );
    for (const key of Object.keys(lock[section])) {
      assert.equal(
        key.includes(PRIVATE_AGENT_PACKAGE),
        false,
        `lock ${section} key must not contain ${PRIVATE_AGENT_PACKAGE}: ${key}`,
      );
    }
  }

  for (const [importerName, importer] of Object.entries(lock.importers)) {
    for (const section of DEPENDENCY_SECTIONS) {
      assert.equal(
        Object.hasOwn(importer[section] ?? {}, PRIVATE_AGENT_PACKAGE),
        false,
        `lock importer ${importerName} ${section}.${PRIVATE_AGENT_PACKAGE}`,
      );
    }
  }
});

test("Core exposes exactly the supported public subpaths", async () => {
  const coreManifest = await readJson("packages/core/package.json");
  const expectedExports = {
    "./runtime": {
      types: "./dist/runtime.d.ts",
      default: "./dist/runtime.js",
    },
    "./authoring": {
      types: "./dist/authoring.d.ts",
      default: "./dist/authoring.js",
    },
    "./agent-host": {
      types: "./dist/agent-host.d.ts",
      default: "./dist/agent-host.js",
    },
    "./format": {
      types: "./dist/format.d.ts",
      default: "./dist/format.js",
    },
    "./ports": {
      types: "./dist/ports.d.ts",
      default: "./dist/ports.js",
    },
    "./media-policy": {
      types: "./dist/media-policy.d.ts",
      default: "./dist/media-policy.js",
    },
    "./styles.css": {
      default: "./dist/styles.css",
    },
  };

  assert.deepEqual(coreManifest.exports, expectedExports, "packages/core/package.json exports");
  assert.equal(
    Object.hasOwn(coreManifest.exports, "."),
    false,
    "Core must not expose a root barrel",
  );
  assert.equal(
    Object.keys(coreManifest.exports).some((subpath) => subpath.includes("*")),
    false,
    "Core must not expose wildcard internal subpaths",
  );
});

test("architecture TypeScript mappings match the supported package source entrypoints", async () => {
  const parsed = parseTypeScriptConfig("tsconfig.architecture.json");
  const expectedPaths = {
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
  };
  assert.deepEqual(parsed.options.paths, expectedPaths, "tsconfig.architecture.json paths");

  const coreManifest = await readJson("packages/core/package.json");
  const mappedCoreSpecifiers = Object.keys(parsed.options.paths)
    .filter((specifier) => specifier.startsWith("@scaffold/core/"))
    .sort();
  const exportedCoreSpecifiers = Object.keys(coreManifest.exports)
    .map((subpath) => `@scaffold/core/${subpath.slice(2)}`)
    .sort();
  assert.deepEqual(
    mappedCoreSpecifiers,
    exportedCoreSpecifiers,
    "architecture Core mappings must match package export keys",
  );
});

test("package and consumer TypeScript aliases stay on approved roots", async () => {
  const coreConfig = parseTypeScriptConfig("packages/core/tsconfig.json");
  assert.deepEqual(coreConfig.options.paths, { "@/*": ["./src/*"] }, "Core TypeScript paths");
  const coreAliasTarget = resolve(coreConfig.options.pathsBasePath, "./src");
  assert.equal(coreAliasTarget, CORE_SOURCE_ROOT, "Core @/* must resolve to packages/core/src/*");

  const consumers = (await readWorkspaceManifests()).filter(
    ({ relativePath }) => relativePath.startsWith("apps/") || relativePath.startsWith("adapters/"),
  );
  for (const { relativePath } of consumers) {
    const configRelativePath = `${dirname(relativePath)}/tsconfig.json`;
    const parsed = parseTypeScriptConfig(configRelativePath);
    const pathsBase =
      parsed.options.pathsBasePath ?? resolve(REPOSITORY_ROOT, dirname(relativePath));
    for (const [specifier, targets] of Object.entries(parsed.options.paths ?? {})) {
      for (const target of targets) {
        const resolvedTarget = resolve(pathsBase, target.replaceAll("*", ""));
        assert.equal(
          isPathInside(CORE_SOURCE_ROOT, resolvedTarget),
          false,
          `${configRelativePath} ${specifier} must not map into packages/core/src`,
        );
      }
    }
  }
});

test("Vite aliases resolve only to approved package-local roots", async () => {
  const coreConfig = await loadViteConfig("packages/core/vite.config.ts");
  assert.deepEqual(aliasEntries(coreConfig.resolve?.alias), [
    { find: "@", replacement: CORE_SOURCE_ROOT },
  ]);
  assert.deepEqual(aliasEntries(coreConfig.pack?.alias), [
    { find: "@", replacement: CORE_SOURCE_ROOT },
  ]);

  const consumers = (await readWorkspaceManifests()).filter(
    ({ relativePath }) => relativePath.startsWith("apps/") || relativePath.startsWith("adapters/"),
  );
  for (const { relativePath } of consumers) {
    const packageDirectory = dirname(relativePath);
    const configRelativePath = `${packageDirectory}/vite.config.ts`;
    const config = await loadViteConfig(configRelativePath);
    const configuredAliases = [
      ...aliasEntries(config.resolve?.alias).map((entry) => ({ section: "resolve", ...entry })),
      ...aliasEntries(config.test?.alias).map((entry) => ({ section: "test", ...entry })),
      ...aliasEntries(config.pack?.alias).map((entry) => ({ section: "pack", ...entry })),
    ];

    for (const { section, find, replacement } of configuredAliases) {
      assert.equal(
        typeof replacement,
        "string",
        `${configRelativePath} ${section}.alias ${find} replacement must be a string`,
      );
      const resolvedTarget = isAbsolute(replacement)
        ? replacement
        : resolve(REPOSITORY_ROOT, packageDirectory, replacement);
      assert.equal(
        isPathInside(CORE_SOURCE_ROOT, resolvedTarget),
        false,
        `${configRelativePath} ${section}.alias ${find} must not target packages/core/src`,
      );
    }
  }
});

test("root static analysis builds workspace outputs before checking consumers", async () => {
  const config = await loadViteConfig("vite.config.ts");

  for (const taskName of ["verify:lint", "verify:types"]) {
    const task = config.run?.tasks?.[taskName];
    assert.equal(typeof task, "object", `${taskName} must declare task prerequisites`);
    assert.deepEqual(
      task.dependsOn,
      ["verify:build"],
      `${taskName} must build workspace package outputs first`,
    );
  }
});
