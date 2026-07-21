import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AssessmentResponseValueSchema,
  AssessmentResultSchema,
  AssessmentTargetContractSchema,
} from "@scaffold/contracts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(packageRoot, "fixtures/assessment-grading.json");
const packagedPath = resolve(packageRoot, "dist/fixtures/assessment-grading.json");
const interactionKinds = new Set([
  "single-select",
  "multi-select",
  "sequence",
  "match",
  "classify",
  "fill-blanks",
  "spatial-hotspot",
]);

function parseCorpus(sourceBytes) {
  if (!sourceBytes.endsWith("\n")) {
    throw new Error("fixtures/assessment-grading.json must end with a newline.");
  }

  const corpus = JSON.parse(sourceBytes);
  if (
    corpus === null ||
    typeof corpus !== "object" ||
    Array.isArray(corpus) ||
    !Array.isArray(corpus.cases)
  ) {
    throw new Error("The assessment grading corpus must be an object with a cases array.");
  }
  if (corpus.cases.length < 21) {
    throw new Error("The assessment grading corpus must contain at least 21 cases.");
  }

  const ids = new Set();
  const countsByKind = new Map([...interactionKinds].map((kind) => [kind, 0]));
  for (const [index, testCase] of corpus.cases.entries()) {
    if (
      testCase === null ||
      typeof testCase !== "object" ||
      Array.isArray(testCase) ||
      typeof testCase.id !== "string" ||
      testCase.id.trim() === ""
    ) {
      throw new Error(`Corpus case ${index} must have a non-blank string id.`);
    }
    if (ids.has(testCase.id)) {
      throw new Error(`Duplicate assessment grading corpus id: ${testCase.id}`);
    }
    ids.add(testCase.id);

    const target = AssessmentTargetContractSchema.parse(testCase.target);
    AssessmentResponseValueSchema.parse(testCase.response);
    AssessmentResultSchema.parse(testCase.expected);

    const kind = target.interaction.kind;
    countsByKind.set(kind, (countsByKind.get(kind) ?? 0) + 1);
  }

  for (const [kind, count] of countsByKind) {
    if (count < 3) {
      throw new Error(`The assessment grading corpus needs at least three ${kind} cases.`);
    }
  }
}

const sourceBytes = await readFile(sourcePath, "utf8");
parseCorpus(sourceBytes);

const flags = new Set(process.argv.slice(2));
if (flags.has("--copy")) {
  await mkdir(dirname(packagedPath), { recursive: true });
  await writeFile(packagedPath, sourceBytes);
}

if (!["--check", "--copy"].some((flag) => flags.has(flag))) {
  throw new Error("Expected --check or --copy.");
}
