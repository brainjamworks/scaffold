import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const adapterRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flags = new Set(process.argv.slice(2));

const artifacts = [
  {
    label: "assessment schema",
    sourcePath: resolve(adapterRoot, "../../packages/contracts/generated/assessment.schema.json"),
    vendoredPath: resolve(adapterRoot, "scaffold/schemas/assessment.schema.json"),
  },
  {
    label: "assessment grading corpus",
    sourcePath: resolve(adapterRoot, "../../packages/grading/fixtures/assessment-grading.json"),
    vendoredPath: resolve(adapterRoot, "tests/fixtures/assessment-grading.json"),
  },
];

if (flags.size !== 1 || !["--write", "--check"].some((flag) => flags.has(flag))) {
  throw new Error("Expected exactly one of --write or --check.");
}

if (flags.has("--write")) {
  for (const { label, sourcePath, vendoredPath } of artifacts) {
    let canonicalBytes;
    try {
      canonicalBytes = await readFile(sourcePath);
    } catch {
      throw new Error(`Missing canonical ${label}: ${relative(adapterRoot, sourcePath)}`);
    }
    await mkdir(dirname(vendoredPath), { recursive: true });
    await writeFile(vendoredPath, canonicalBytes);
  }
}

if (flags.has("--check")) {
  const failures = [];
  for (const { label, sourcePath, vendoredPath } of artifacts) {
    let canonicalBytes;
    try {
      canonicalBytes = await readFile(sourcePath);
    } catch {
      failures.push(`missing canonical ${label}: ${relative(adapterRoot, sourcePath)}`);
      continue;
    }
    let vendoredBytes;
    try {
      vendoredBytes = await readFile(vendoredPath);
    } catch {
      failures.push(`missing packaged ${label}: ${relative(adapterRoot, vendoredPath)}`);
      continue;
    }

    if (!vendoredBytes.equals(canonicalBytes)) {
      failures.push(
        `modified packaged ${label}: ${relative(adapterRoot, vendoredPath)} differs from ${relative(adapterRoot, sourcePath)}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Assessment artifact drift. Run vp run @scaffold/adapter-moodle#sync:assessment-artifacts:\n${failures.join("\n")}`,
    );
  }
}
