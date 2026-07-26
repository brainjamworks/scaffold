import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const LICENCE_FILE_PATTERN = /^(?:licen[cs]e|copying|ofl)(?:$|[._-])/i;
const NOTICE_FILE_PATTERN = /^(?:notice|copyright)(?:$|[._-])/i;
const FALLBACK_LICENCE_SOURCES = new Map([
  ["client-only", "react"],
  ["react-remove-scroll-bar", "react-remove-scroll"],
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function loadProductionLicenceInventory(inputPath = null) {
  if (inputPath) {
    return JSON.parse(readFileSync(resolve(inputPath), "utf8"));
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

function installedPackageRecords(inventory) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    throw new Error("The production licence inventory must be an object.");
  }

  const records = new Map();
  for (const packages of Object.values(inventory)) {
    if (!Array.isArray(packages)) {
      throw new Error("Each production licence inventory group must be an array.");
    }
    for (const packageMetadata of packages) {
      if (typeof packageMetadata?.name !== "string") {
        throw new Error("The production licence inventory contains invalid package metadata.");
      }
      for (const packagePath of packageMetadata.paths ?? []) {
        const metadata = JSON.parse(readFileSync(join(packagePath, "package.json"), "utf8"));
        if (
          metadata.name !== packageMetadata.name ||
          typeof metadata.version !== "string" ||
          !metadata.version
        ) {
          throw new Error(`Could not identify installed package metadata in ${packagePath}.`);
        }
        const key = `${metadata.name}\0${metadata.version}`;
        if (!records.has(key)) {
          records.set(key, []);
        }
        records
          .get(key)
          .push({ name: metadata.name, path: packagePath, version: metadata.version });
      }
    }
  }
  return records;
}

function noticeFiles(packagePath) {
  return readdirSync(packagePath)
    .filter(
      (name) =>
        (LICENCE_FILE_PATTERN.test(name) || NOTICE_FILE_PATTERN.test(name)) &&
        statSync(join(packagePath, name)).isFile(),
    )
    .sort(compareText)
    .map((name) => {
      const content = readFileSync(join(packagePath, name), "utf8")
        .replaceAll("\r\n", "\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n");
      if (!content.trim()) {
        throw new Error(`${packagePath}/${name} is empty.`);
      }
      return { content, name };
    });
}

function noticeBundle(records, name, version) {
  const candidates = records.get(`${name}\0${version}`) ?? [];
  const bundles = new Map();
  for (const candidate of candidates) {
    const files = noticeFiles(candidate.path);
    const key = JSON.stringify(files);
    if (!bundles.has(key)) {
      bundles.set(key, { files, source: `${candidate.name}@${candidate.version}` });
    }
  }
  if (bundles.size > 1) {
    throw new Error(`${name}@${version} has inconsistent installed licence or notice files.`);
  }
  return bundles.values().next().value ?? null;
}

function fallbackNoticeBundle(records, packageName) {
  const sourceName = FALLBACK_LICENCE_SOURCES.get(packageName);
  if (!sourceName) return null;

  const matches = [...records.entries()]
    .filter(([key]) => key.startsWith(`${sourceName}\0`))
    .flatMap(([, candidates]) => candidates)
    .sort(
      (left, right) =>
        compareText(left.version, right.version) || compareText(left.path, right.path),
    );
  const bundles = new Map();
  for (const match of matches) {
    const files = noticeFiles(match.path);
    const key = JSON.stringify(files);
    if (!bundles.has(key)) {
      bundles.set(key, { files, source: `${match.name}@${match.version}` });
    }
  }
  if (bundles.size !== 1) {
    throw new Error(`${packageName} does not have one unambiguous fallback licence source.`);
  }
  return bundles.values().next().value;
}

function packageNoticeBundle(records, packageMetadata) {
  const directBundle = noticeBundle(records, packageMetadata.name, packageMetadata.version);
  const bundle =
    directBundle?.files.length > 0
      ? directBundle
      : fallbackNoticeBundle(records, packageMetadata.name);
  if (!bundle || !bundle.files.some(({ name }) => LICENCE_FILE_PATTERN.test(name))) {
    throw new Error(
      `${packageMetadata.name}@${packageMetadata.version} has no packaged licence text.`,
    );
  }
  return bundle;
}

function fencedText(content) {
  const longestFence = Math.max(0, ...[...content.matchAll(/`+/g)].map(([match]) => match.length));
  const fence = "`".repeat(Math.max(3, longestFence + 1));
  const body = content.endsWith("\n") ? content.slice(0, -1) : content;
  return [`${fence}text`, body, fence].join("\n");
}

export function renderLicenceAndNoticeTexts(packages, inventory) {
  const records = installedPackageRecords(inventory);
  const textGroups = new Map();
  const uniquePackages = [...packages]
    .filter(
      (packageMetadata, index, allPackages) =>
        allPackages.findIndex(
          (candidate) =>
            candidate.name === packageMetadata.name &&
            candidate.version === packageMetadata.version,
        ) === index,
    )
    .sort(
      (left, right) =>
        compareText(left.name, right.name) || compareText(left.version, right.version),
    );

  for (const packageMetadata of uniquePackages) {
    const licence = packageMetadata.licence ?? packageMetadata.license;
    if (typeof licence !== "string" || !licence) {
      throw new Error(
        `${packageMetadata.name}@${packageMetadata.version} has no declared licence identifier.`,
      );
    }
    const bundle = packageNoticeBundle(records, packageMetadata);
    for (const file of bundle.files) {
      if (!textGroups.has(file.content)) {
        textGroups.set(file.content, {
          applications: new Map(),
          content: file.content,
          fileNames: new Set(),
        });
      }
      const group = textGroups.get(file.content);
      const applicationKey = `${packageMetadata.name}\0${packageMetadata.version}`;
      group.applications.set(applicationKey, {
        licence,
        name: packageMetadata.name,
        source: bundle.source,
        version: packageMetadata.version,
      });
      group.fileNames.add(file.name);
    }
  }

  const groups = [...textGroups.values()]
    .map((group) => ({
      ...group,
      applications: [...group.applications.values()].sort(
        (left, right) =>
          compareText(left.name, right.name) || compareText(left.version, right.version),
      ),
      fileNames: [...group.fileNames].sort(compareText),
    }))
    .sort((left, right) => {
      const leftPackage = left.applications[0];
      const rightPackage = right.applications[0];
      return (
        compareText(leftPackage.name, rightPackage.name) ||
        compareText(leftPackage.version, rightPackage.version) ||
        compareText(left.fileNames[0], right.fileNames[0])
      );
    });

  const sections = groups.flatMap((group, index) => {
    const applications = group.applications.map(({ licence, name, source, version }) => {
      const packageIdentity = `${name}@${version}`;
      const sourceNote = source === packageIdentity ? "" : `; text supplied by \`${source}\``;
      return `- \`${packageIdentity}\` — declared \`${licence}\`${sourceNote}`;
    });
    return [
      `### Text ${index + 1}: ${group.fileNames.map((name) => `\`${name}\``).join(", ")}`,
      "",
      "**Applies to:**",
      "",
      ...applications,
      "",
      fencedText(group.content),
      "",
    ];
  });

  return [
    "## Licence and notice texts",
    "",
    "These texts are copied from the installed production packages represented",
    "above. Identical texts are included once while every applicable package",
    "and declared licence remains explicit.",
    "",
    ...sections,
  ].join("\n");
}
