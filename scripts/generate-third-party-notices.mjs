#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function parseArguments(argv) {
  const options = {
    check: false,
    input: null,
    output: resolve("THIRD_PARTY_NOTICES.md"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    if (argument === "--input" || argument === "--output") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Expected a value after ${argument}.`);
      }
      options[argument.slice(2)] = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}.`);
  }
  return options;
}

function loadLicenceInventory(inputPath) {
  if (inputPath) {
    return JSON.parse(readFileSync(inputPath, "utf8"));
  }
  const result = spawnSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Could not read the production licence inventory.");
  }
  return JSON.parse(result.stdout);
}

function markdownCell(value) {
  return String(value ?? "")
    .replaceAll("\\", String.raw`\\`)
    .replaceAll("|", String.raw`\|`)
    .replaceAll("\n", " ");
}

function noticeRows(inventory) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    throw new Error("The production licence inventory must be an object.");
  }
  const rows = [];
  for (const [licence, packages] of Object.entries(inventory)) {
    if (!Array.isArray(packages)) {
      throw new Error(`Licence group ${licence} must be an array.`);
    }
    for (const packageMetadata of packages) {
      const { homepage = "", name, versions } = packageMetadata ?? {};
      if (typeof name !== "string" || !Array.isArray(versions)) {
        throw new Error(`Licence group ${licence} contains invalid package metadata.`);
      }
      if (name === "scaffold" || name.startsWith("@scaffold/")) {
        continue;
      }
      for (const version of versions) {
        if (typeof version !== "string") {
          throw new Error(`Package ${name} contains an invalid version.`);
        }
        rows.push({ homepage, licence, name, version });
      }
    }
  }
  return rows
    .filter(
      (row, index, allRows) =>
        allRows.findIndex(
          (candidate) =>
            candidate.name === row.name &&
            candidate.version === row.version &&
            candidate.licence === row.licence,
        ) === index,
    )
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.version.localeCompare(right.version) ||
        left.licence.localeCompare(right.licence),
    );
}

function renderNotices(inventory) {
  const tableRows = noticeRows(inventory).map(({ homepage, licence, name, version }) => [
    markdownCell(name),
    markdownCell(version),
    markdownCell(licence),
    markdownCell(homepage ? `[upstream](${homepage})` : ""),
  ]);
  const headers = ["Package", "Version", "Licence", "Project"];
  const widths = headers.map((header, index) =>
    Math.max(header.length, 3, ...tableRows.map((row) => row[index].length)),
  );
  const formatRow = (row) =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;
  return [
    "# Third-Party Notices",
    "",
    "This generated inventory records production dependencies that may be bundled",
    "in Scaffold adapter distributions. The packages remain subject to their own",
    "licence terms; project links identify their upstream source and notices.",
    "",
    formatRow(headers),
    formatRow(widths.map((width) => "-".repeat(width))),
    ...tableRows.map(formatRow),
    "",
    "Generated with `node scripts/generate-third-party-notices.mjs` from the",
    "production dependency graph locked by `pnpm-lock.yaml`.",
    "",
  ].join("\n");
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const expected = renderNotices(loadLicenceInventory(options.input));
  if (options.check) {
    const current = readFileSync(options.output, "utf8");
    if (current !== expected) {
      throw new Error("THIRD_PARTY_NOTICES.md is stale; regenerate it before release.");
    }
    console.log("THIRD_PARTY_NOTICES.md is current.");
    return;
  }
  writeFileSync(options.output, expected);
  console.log(`Wrote ${options.output}.`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}`);
  process.exitCode = 1;
}
