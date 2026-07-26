#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "vite-plus";

import {
  loadProductionLicenceInventory,
  renderLicenceAndNoticeTexts,
} from "../../../scripts/third-party-license-text.mjs";

const DEFAULT_ADAPTER_ROOT = fileURLToPath(new URL("..", import.meta.url));
const NODE_MODULES_MARKER = `${sep}node_modules${sep}`;

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function packageRootForSource(sourceId) {
  const unprefixedSourceId = sourceId.startsWith("\0") ? sourceId.slice(1) : sourceId;
  const cleanSourceId = unprefixedSourceId.split("?", 1)[0];
  const markerIndex = cleanSourceId.lastIndexOf(NODE_MODULES_MARKER);
  if (markerIndex < 0) return null;

  const packagePath = cleanSourceId.slice(markerIndex + NODE_MODULES_MARKER.length);
  const pathParts = packagePath.split(sep);
  const packagePartCount = pathParts[0]?.startsWith("@") ? 2 : 1;
  if (pathParts.length < packagePartCount) {
    throw new Error(`Could not identify the package owning ${sourceId}.`);
  }

  return (
    cleanSourceId.slice(0, markerIndex + NODE_MODULES_MARKER.length) +
    pathParts.slice(0, packagePartCount).join(sep)
  );
}

function normaliseRepository(packageMetadata) {
  const repositoryValue =
    typeof packageMetadata.repository === "string"
      ? packageMetadata.repository
      : packageMetadata.repository?.url;
  let repository =
    typeof repositoryValue === "string" && repositoryValue.trim()
      ? repositoryValue.trim()
      : packageMetadata.homepage;

  if (typeof repository !== "string" || !repository.trim()) {
    throw new Error(
      `${packageMetadata.name}@${packageMetadata.version} has no upstream source URL.`,
    );
  }

  repository = repository.trim().replace(/^git\+/, "");
  repository = repository.replace(/^git:\/\/github\.com\//, "https://github.com/");
  repository = repository.replace(/^git@github\.com:/, "https://github.com/");
  repository = repository.replace(/^github:/, "https://github.com/");
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) {
    repository = `https://github.com/${repository}`;
  }
  repository = repository.replace(/\.git$/, "");
  if (!/^https?:\/\//.test(repository)) {
    throw new Error(
      `${packageMetadata.name}@${packageMetadata.version} has an invalid upstream source URL.`,
    );
  }
  return repository;
}

async function packageMetadataForSource(sourceId, metadataCache) {
  const packageRoot = packageRootForSource(sourceId);
  if (packageRoot === null) return null;
  if (!metadataCache.has(packageRoot)) {
    metadataCache.set(
      packageRoot,
      readFile(resolve(packageRoot, "package.json"), "utf8").then((source) => JSON.parse(source)),
    );
  }

  const packageMetadata = await metadataCache.get(packageRoot);
  if (
    typeof packageMetadata.name !== "string" ||
    typeof packageMetadata.version !== "string" ||
    typeof packageMetadata.license !== "string" ||
    !packageMetadata.name ||
    !packageMetadata.version ||
    !packageMetadata.license
  ) {
    throw new Error(`Incomplete package metadata in ${packageRoot}/package.json.`);
  }
  return packageMetadata;
}

function outputLocation(outputFiles) {
  return [...outputFiles].every((outputFile) => outputFile.startsWith("public/assets/"))
    ? "public/assets"
    : "public";
}

export async function collectBundledLibraries({ adapterRoot = DEFAULT_ADAPTER_ROOT } = {}) {
  let moduleIds = [];
  const buildResult = await build({
    root: adapterRoot,
    configFile: resolve(adapterRoot, "vite.config.ts"),
    logLevel: "warn",
    plugins: [
      {
        name: "scaffold-third-party-inventory",
        generateBundle() {
          moduleIds = [...this.getModuleIds()];
        },
      },
    ],
    build: {
      write: false,
    },
  });
  const rollupOutputs = Array.isArray(buildResult) ? buildResult : [buildResult];
  const assetContributions = [];
  const contributions = [];
  const stylesheetOutputs = [];

  for (const rollupOutput of rollupOutputs) {
    for (const output of rollupOutput.output) {
      const packagedOutput = `public/${output.fileName}`;
      if (output.type === "chunk") {
        for (const sourceId of Object.keys(output.modules)) {
          contributions.push({ outputFile: packagedOutput, sourceId });
        }
        continue;
      }
      if (output.fileName.endsWith(".css")) {
        stylesheetOutputs.push({
          outputFile: packagedOutput,
          source:
            typeof output.source === "string"
              ? output.source
              : Buffer.from(output.source).toString("utf8"),
        });
      }
      for (const originalFileName of output.originalFileNames ?? []) {
        const contribution = {
          outputFile: packagedOutput,
          sourceId: resolve(adapterRoot, originalFileName),
        };
        assetContributions.push(contribution);
        contributions.push(contribution);
      }
    }
  }

  for (const sourceId of moduleIds.filter((moduleId) => /\.css(?:\?|$)/.test(moduleId))) {
    for (const stylesheet of stylesheetOutputs) {
      contributions.push({
        outputFile: stylesheet.outputFile,
        sourceId,
      });
    }
  }
  for (const assetContribution of assetContributions) {
    const emittedAsset = assetContribution.outputFile.slice("public/".length);
    for (const stylesheet of stylesheetOutputs) {
      if (stylesheet.source.includes(emittedAsset)) {
        contributions.push({
          outputFile: stylesheet.outputFile,
          sourceId: assetContribution.sourceId,
        });
      }
    }
  }

  const libraries = new Map();
  const metadataCache = new Map();
  for (const { outputFile, sourceId } of contributions) {
    const packageMetadata = await packageMetadataForSource(sourceId, metadataCache);
    if (
      packageMetadata === null ||
      packageMetadata.name === "scaffold" ||
      packageMetadata.name.startsWith("@scaffold/")
    ) {
      continue;
    }

    const key = `${packageMetadata.name}\0${packageMetadata.version}`;
    if (!libraries.has(key)) {
      libraries.set(key, {
        description:
          typeof packageMetadata.description === "string" && packageMetadata.description.trim()
            ? packageMetadata.description.trim()
            : `${packageMetadata.name} frontend dependency.`,
        license: packageMetadata.license,
        name: packageMetadata.name,
        outputFiles: new Set(),
        repository: normaliseRepository(packageMetadata),
        version: packageMetadata.version,
      });
    }
    libraries.get(key).outputFiles.add(outputFile);
  }

  return [...libraries.values()]
    .map((library) => ({
      ...library,
      location: outputLocation(library.outputFiles),
      outputFiles: [...library.outputFiles].sort(compareText),
    }))
    .sort(
      (left, right) =>
        compareText(left.name, right.name) || compareText(left.version, right.version),
    );
}

function xmlText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderThirdPartyLibraries(libraries) {
  const entries = libraries.flatMap((library) => [
    "  <library>",
    `    <location>${xmlText(library.location)}</location>`,
    `    <name>${xmlText(library.name)}</name>`,
    `    <description>${xmlText(library.description)}</description>`,
    `    <version>${xmlText(library.version)}</version>`,
    `    <license>${xmlText(library.license)}</license>`,
    `    <repository>${xmlText(library.repository)}</repository>`,
    "  </library>",
  ]);

  return [
    '<?xml version="1.0"?>',
    "<!-- Generated by scripts/sync-third-party-libraries.mjs. Do not edit. -->",
    "<libraries>",
    ...entries,
    "</libraries>",
    "",
  ].join("\n");
}

function markdownCell(value) {
  return String(value)
    .replaceAll("\\", String.raw`\\`)
    .replaceAll("|", String.raw`\|`);
}

export function renderThirdPartyNotices(libraries, inventory = loadProductionLicenceInventory()) {
  const tableRows = libraries.map(({ license, location, name, repository, version }) => [
    markdownCell(name),
    markdownCell(version),
    markdownCell(license),
    markdownCell(location),
    markdownCell(`[source](${repository})`),
  ]);
  const headers = ["Package", "Version", "Licence", "Packaged location", "Upstream"];
  const widths = headers.map((header, index) =>
    Math.max(header.length, 3, ...tableRows.map((row) => row[index].length)),
  );
  const formatRow = (row) =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;

  return [
    "# Third-Party Notices",
    "",
    "This generated inventory lists the exact third-party packages represented in",
    "the compiled Scaffold Moodle frontend. The packages remain subject to their",
    "own licence terms. `thirdpartylibs.xml` contains the matching Moodle metadata.",
    "",
    formatRow(headers),
    formatRow(widths.map((width) => "-".repeat(width))),
    ...tableRows.map(formatRow),
    "",
    "Generated from the tree-shaken Vite output and package metadata locked by",
    "`pnpm-lock.yaml`; run `vp run @scaffold/adapter-moodle#sync:third-party-libraries`",
    "after changing frontend dependencies or generated output.",
    "",
    renderLicenceAndNoticeTexts(libraries, inventory),
  ].join("\n");
}

async function syncThirdPartyLibraries(mode) {
  const pluginRoot = resolve(DEFAULT_ADAPTER_ROOT, "scaffold");
  const libraries = await collectBundledLibraries();
  const generatedFiles = [
    {
      content: renderThirdPartyLibraries(libraries),
      path: resolve(pluginRoot, "thirdpartylibs.xml"),
    },
    {
      content: renderThirdPartyNotices(libraries),
      path: resolve(pluginRoot, "THIRD_PARTY_NOTICES.md"),
    },
  ];

  if (mode === "--write") {
    await Promise.all(generatedFiles.map(({ content, path }) => writeFile(path, content, "utf8")));
    console.log(`Wrote Moodle metadata for ${libraries.length} bundled libraries.`);
    return;
  }
  if (mode !== "--check") {
    throw new Error("Use --check or --write.");
  }

  for (const { content, path } of generatedFiles) {
    const current = await readFile(path, "utf8");
    if (current !== content) {
      throw new Error(
        `${path.slice(pluginRoot.length + 1)} is stale; run the third-party sync command.`,
      );
    }
  }
  console.log(`Moodle metadata is current for ${libraries.length} bundled libraries.`);
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  syncThirdPartyLibraries(process.argv[2]).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    process.exitCode = 1;
  });
}
