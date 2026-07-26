#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const TAG_PATTERN = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

function parseArguments(argv) {
  const allowed = new Set([
    "--repository-root",
    "--tag",
    "--commit",
    "--notes-output",
    "--github-output",
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error(`Expected a value after ${name ?? "each argument"}.`);
    }
    if (!allowed.has(name)) {
      throw new Error(`Unknown argument: ${name}.`);
    }
    if (values.has(name)) {
      throw new Error(`Duplicate argument: ${name}.`);
    }
    values.set(name, value);
  }

  for (const name of allowed) {
    if (!values.has(name)) {
      throw new Error(`${name} is required.`);
    }
  }
  return values;
}

function readText(repositoryRoot, relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

function matchValue(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not read ${label}.`);
  }
  return match[1];
}

function releaseSection(changelog, version, label) {
  const escapedVersion = version.replaceAll(".", String.raw`\.`);
  const heading = new RegExp(String.raw`^## ${escapedVersion} - \d{4}-\d{2}-\d{2}\s*$`, "m");
  const match = heading.exec(changelog);
  if (!match) {
    throw new Error(`${label} must contain a dated ${version} release heading.`);
  }

  const sectionStart = match.index + match[0].length;
  const nextHeading = /^##\s/m.exec(changelog.slice(sectionStart));
  const sectionEnd = nextHeading === null ? changelog.length : sectionStart + nextHeading.index;
  return changelog.slice(sectionStart, sectionEnd).trim();
}

function loadRelease(repositoryRoot, tag, commit) {
  const tagMatch = TAG_PATTERN.exec(tag);
  if (!tagMatch) {
    throw new Error("Release tag must use vMAJOR.MINOR.PATCH.");
  }
  if (!COMMIT_PATTERN.test(commit)) {
    throw new Error("Release commit must be a 40-character lowercase Git SHA.");
  }

  const version = tagMatch[1];
  const productManifest = JSON.parse(readText(repositoryRoot, "package.json"));
  const productVersion = productManifest.version;
  if (typeof productVersion !== "string" || !SEMVER_PATTERN.test(productVersion)) {
    throw new Error("Root package.json version must use MAJOR.MINOR.PATCH.");
  }

  const moodleVersionSource = readText(repositoryRoot, "adapters/moodle/scaffold/version.php");
  const moodleRelease = matchValue(
    moodleVersionSource,
    /\$plugin->release\s*=\s*['"]([^'"]+)['"]\s*;/,
    "the Moodle release",
  );
  const xblockProjectSource = readText(repositoryRoot, "adapters/xblock/pyproject.toml");
  const xblockVersion = matchValue(
    xblockProjectSource,
    /^version\s*=\s*"([^"]+)"\s*$/m,
    "the XBlock version",
  );

  for (const [label, foundVersion] of [
    ["root product", productVersion],
    ["Moodle", moodleRelease],
    ["XBlock", xblockVersion],
  ]) {
    if (foundVersion !== version) {
      throw new Error(`${label} version ${foundVersion} does not match release tag ${tag}.`);
    }
  }

  return {
    commit,
    version,
    changes: releaseSection(readText(repositoryRoot, "CHANGELOG.md"), version, "Root CHANGELOG.md"),
    moodleChanges: releaseSection(
      readText(repositoryRoot, "adapters/moodle/scaffold/CHANGES.md"),
      version,
      "Moodle CHANGES.md",
    ),
    xblockChanges: releaseSection(
      readText(repositoryRoot, "adapters/xblock/CHANGES.md"),
      version,
      "XBlock CHANGES.md",
    ),
  };
}

function releaseNotes(release) {
  return [
    `Scaffold ${release.version} is an alpha prerelease.`,
    "",
    "## Changes",
    "",
    release.changes,
    "",
    "## Moodle",
    "",
    release.moodleChanges,
    "",
    "## Open edX XBlock",
    "",
    release.xblockChanges,
    "",
    "## Verification",
    "",
    `- Source commit: \`${release.commit}\``,
    "- Required CI: exact run and Moodle digest in `release-evidence.json`",
    "- Exact package checks: passed",
    "- Checksums: SHA256SUMS verified",
    "- Provenance: GitHub artifact attestations attached",
    "- Moodle smoke test: pending",
    "- Open edX smoke test: pending",
    "",
    "Replace the pending entries before approval using exactly these prefixes:",
    "",
    "- Moodle smoke test: passed on <host version and result>",
    "- Open edX smoke test: passed on <host version and result>",
    "",
  ].join("\n");
}

function writeOutput(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function main() {
  const argumentsMap = parseArguments(process.argv.slice(2));
  const release = loadRelease(
    resolve(argumentsMap.get("--repository-root")),
    argumentsMap.get("--tag"),
    argumentsMap.get("--commit"),
  );
  writeOutput(argumentsMap.get("--notes-output"), releaseNotes(release));
  writeOutput(
    argumentsMap.get("--github-output"),
    `version=${release.version}\nrelease_title=Scaffold ${release.version}\n`,
  );
  console.log(`Prepared release candidate metadata for v${release.version}.`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}`);
  process.exitCode = 1;
}
