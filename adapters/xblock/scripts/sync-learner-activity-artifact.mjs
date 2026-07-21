import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const adapterRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(adapterRoot, "../..");
const sourcePath = resolve(
  repositoryRoot,
  "packages/contracts/generated/learner-activity.schema.json",
);
const destinationPath = resolve(
  adapterRoot,
  "scaffold_xblock/validation/schemas/learner-activity.schema.json",
);

const sourceBytes = await readFile(sourcePath);
const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  let destinationBytes;
  try {
    destinationBytes = await readFile(destinationPath);
  } catch {
    throw new Error(
      "Missing vendored learner activity schema. Run sync:learner-activity-artifact.",
    );
  }

  if (!sourceBytes.equals(destinationBytes)) {
    throw new Error(
      "Vendored learner activity schema has drifted. Run sync:learner-activity-artifact.",
    );
  }
} else {
  await mkdir(dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, sourceBytes);
}
