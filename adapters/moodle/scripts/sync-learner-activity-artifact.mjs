import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const adapterRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(
  adapterRoot,
  "../../packages/contracts/generated/learner-activity.schema.json",
);
const vendoredPath = resolve(adapterRoot, "scaffold/schemas/learner-activity.schema.json");
const flags = new Set(process.argv.slice(2));

if (flags.size !== 1 || !["--write", "--check"].some((flag) => flags.has(flag))) {
  throw new Error("Expected exactly one of --write or --check.");
}

let canonicalBytes;
try {
  canonicalBytes = await readFile(sourcePath);
} catch {
  throw new Error(
    `Missing canonical learner activity schema: ${relative(adapterRoot, sourcePath)}`,
  );
}

if (flags.has("--write")) {
  await mkdir(dirname(vendoredPath), { recursive: true });
  await writeFile(vendoredPath, canonicalBytes);
}

if (flags.has("--check")) {
  let vendoredBytes;
  try {
    vendoredBytes = await readFile(vendoredPath);
  } catch {
    throw new Error(
      `Missing packaged learner activity schema: ${relative(adapterRoot, vendoredPath)}. Run vp run @scaffold/adapter-moodle#sync:learner-activity-artifact.`,
    );
  }

  if (!vendoredBytes.equals(canonicalBytes)) {
    throw new Error(
      `Modified packaged learner activity schema: ${relative(adapterRoot, vendoredPath)} differs from ${relative(adapterRoot, sourcePath)}. Run vp run @scaffold/adapter-moodle#sync:learner-activity-artifact.`,
    );
  }
}
