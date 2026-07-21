import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { zodToJsonSchema } from "zod-to-json-schema";

import {
  AnswerRevealSchema,
  AssessmentFeedbackContentSchema,
  AssessmentGradeProjectionSchema,
  AssessmentGroupContractSchema,
  AssessmentItemDetailSchema,
  AssessmentItemValueSchema,
  AssessmentLearnerSnapshotSchema,
  AssessmentProblemSnapshotSchema,
  AssessmentResponseValueSchema,
  AssessmentResultSchema,
  AssessmentTargetContractSchema,
  QuizAttemptSnapshotSchema,
  QuizAttemptStateSchema,
} from "../dist/index.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedPath = resolve(packageRoot, "generated/assessment.schema.json");
const packagedPath = resolve(packageRoot, "dist/schemas/assessment.schema.json");

const definitions = {
  AnswerReveal: AnswerRevealSchema,
  AssessmentFeedbackContent: AssessmentFeedbackContentSchema,
  AssessmentGradeProjection: AssessmentGradeProjectionSchema,
  AssessmentGroupContract: AssessmentGroupContractSchema,
  AssessmentItemDetail: AssessmentItemDetailSchema,
  AssessmentItemValue: AssessmentItemValueSchema,
  AssessmentLearnerSnapshot: AssessmentLearnerSnapshotSchema,
  AssessmentProblemSnapshot: AssessmentProblemSnapshotSchema,
  AssessmentResponseValue: AssessmentResponseValueSchema,
  AssessmentResult: AssessmentResultSchema,
  AssessmentTargetContract: AssessmentTargetContractSchema,
  QuizAttemptSnapshot: QuizAttemptSnapshotSchema,
  QuizAttemptState: QuizAttemptStateSchema,
};

const uniqueArrayProperties = new Set(["submittedTargetIds", "targetIds"]);

function addPortableArrayInvariants(jsonSchema, _definition, refs) {
  const propertyName = refs.currentPath.at(-1);
  const parentPath = refs.currentPath.at(-2);
  if (
    parentPath === "properties" &&
    uniqueArrayProperties.has(propertyName) &&
    jsonSchema?.type === "array"
  ) {
    return { ...jsonSchema, uniqueItems: true };
  }

  return jsonSchema;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}

function stringifyJson(value, depth = 0, linePrefixLength = 0) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every((item) => item === null || typeof item !== "object")) {
      const inline = `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
      if (linePrefixLength + inline.length <= 100) return inline;
    }

    const indentation = "  ".repeat(depth + 1);
    return `[\n${value
      .map((item) => `${indentation}${stringifyJson(item, depth + 1, indentation.length)}`)
      .join(",\n")}\n${"  ".repeat(depth)}]`;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return "{}";

  const indentation = "  ".repeat(depth + 1);
  return `{\n${entries
    .map(([key, child]) => {
      const prefix = `${indentation}${JSON.stringify(key)}: `;
      return `${prefix}${stringifyJson(child, depth + 1, prefix.length)}`;
    })
    .join(",\n")}\n${"  ".repeat(depth)}}`;
}

function generateSchema() {
  const converted = zodToJsonSchema(AssessmentLearnerSnapshotSchema, {
    definitions,
    definitionPath: "definitions",
    effectStrategy: "input",
    removeAdditionalStrategy: "strict",
    postProcess: addPortableArrayInvariants,
    strictUnions: true,
    target: "jsonSchema7",
  });

  return sortJson({
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://scaffold.ac/schemas/assessment.schema.json",
    title: "Scaffold assessment contracts",
    $comment:
      "This bundle is generated from the strict v1 Zod contracts and carries their portable assessment invariants.",
    definitions: converted.definitions,
  });
}

const expectedBytes = `${stringifyJson(generateSchema())}\n`;
const flags = new Set(process.argv.slice(2));

if (flags.has("--write")) {
  await mkdir(dirname(generatedPath), { recursive: true });
  await writeFile(generatedPath, expectedBytes);
}

if (flags.has("--check") || flags.has("--copy")) {
  let actualBytes;
  try {
    actualBytes = await readFile(generatedPath, "utf8");
  } catch {
    throw new Error(
      "Missing generated/assessment.schema.json. Run the generate:assessment-schema script.",
    );
  }

  if (actualBytes !== expectedBytes) {
    throw new Error(
      "generated/assessment.schema.json has drifted. Run the generate:assessment-schema script.",
    );
  }
}

if (flags.has("--copy")) {
  await mkdir(dirname(packagedPath), { recursive: true });
  await writeFile(packagedPath, expectedBytes);
}

if (!["--write", "--check", "--copy"].some((flag) => flags.has(flag))) {
  throw new Error("Expected one of --write, --check, or --copy.");
}
