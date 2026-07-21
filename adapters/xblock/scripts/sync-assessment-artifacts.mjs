import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const adapterRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(adapterRoot, "../..");
const checkOnly = process.argv.includes("--check");

const artifacts = [
  {
    label: "assessment schema",
    sourcePath: resolve(repositoryRoot, "packages/contracts/generated/assessment.schema.json"),
    destinationPath: resolve(
      adapterRoot,
      "scaffold_xblock/validation/schemas/assessment.schema.json",
    ),
  },
  {
    label: "assessment grading corpus",
    sourcePath: resolve(repositoryRoot, "packages/grading/fixtures/assessment-grading.json"),
    destinationPath: resolve(
      adapterRoot,
      "scaffold_xblock/validation/fixtures/assessment-grading.json",
    ),
  },
];

for (const artifact of artifacts) {
  const sourceBytes = await readFile(artifact.sourcePath);

  if (checkOnly) {
    let destinationBytes;
    try {
      destinationBytes = await readFile(artifact.destinationPath);
    } catch {
      throw new Error(`Missing vendored ${artifact.label}. Run sync:assessment-artifacts.`);
    }

    if (!sourceBytes.equals(destinationBytes)) {
      throw new Error(`Vendored ${artifact.label} has drifted. Run sync:assessment-artifacts.`);
    }
  } else {
    await mkdir(dirname(artifact.destinationPath), { recursive: true });
    await writeFile(artifact.destinationPath, sourceBytes);
  }
}
