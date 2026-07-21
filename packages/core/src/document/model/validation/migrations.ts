import type { JSONContent } from "@tiptap/core";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";

import { validateCourseDocumentJSON, type CourseDocumentIssue } from "./validators";
import {
  runCourseDocumentMigrationSteps,
  validateCourseDocumentMigrationPlan,
  type CourseDocumentMigrationStep,
} from "./migration-registry";
import { asRecord, findCourseDocument } from "./migrations/helpers";
import { v1ToV2CourseDocumentMigration } from "./migrations/v1-to-v2";
import { v2ToV3CourseDocumentMigration } from "./migrations/v2-to-v3";

export type CourseDocumentMigrationErrorCode =
  | "invalid_json"
  | "invalid_document_version"
  | "unsupported_document_version"
  | "missing_migration_step"
  | "migration_failed"
  | "invalid_migrated_document";

export type CourseDocumentMigrationResult =
  | {
      ok: true;
      document: JSONContent;
      fromVersion: number;
      toVersion: number;
      migrated: boolean;
    }
  | {
      ok: false;
      code: CourseDocumentMigrationErrorCode;
      message: string;
      fromVersion: number | null;
      toVersion: number;
      issues?: CourseDocumentIssue[];
    };

const MIGRATIONS: readonly CourseDocumentMigrationStep[] = validateCourseDocumentMigrationPlan(
  [v1ToV2CourseDocumentMigration, v2ToV3CourseDocumentMigration],
  SCAFFOLD_DOCUMENT_FORMAT_VERSION,
);

export function readCourseDocumentFormatVersion(content: unknown): number | null {
  const courseDocument = findCourseDocument(content);
  if (!courseDocument) return null;

  const attrs = asRecord(courseDocument.node.attrs);
  const version = attrs?.["schemaVersion"];

  if (version === undefined || version === null || version === "") return null;

  const parsed = typeof version === "number" ? version : Number(version);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

export function migrateCourseDocumentJSON(content: unknown): CourseDocumentMigrationResult {
  const document = cloneJSONContent(content);
  if (!document) {
    return migrationError(
      "invalid_json",
      "Scaffold document content must be JSON object content.",
      null,
    );
  }

  const fromVersion = readCourseDocumentFormatVersion(document);
  if (fromVersion === null) {
    return migrationError(
      "invalid_document_version",
      "Scaffold document format version could not be read.",
      null,
    );
  }

  if (fromVersion > SCAFFOLD_DOCUMENT_FORMAT_VERSION) {
    return migrationError(
      "unsupported_document_version",
      `Scaffold document format v${fromVersion} is newer than this runtime supports.`,
      fromVersion,
    );
  }

  let migrated;
  try {
    migrated = runCourseDocumentMigrationSteps({
      document,
      fromVersion,
      toVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      migrations: MIGRATIONS,
    });
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    return migrationError(
      "migration_failed",
      `Scaffold document v${fromVersion} could not be migrated.${detail}`,
      fromVersion,
    );
  }
  if (!migrated.ok) {
    return migrationError(
      "missing_migration_step",
      `No Scaffold document migration exists from v${migrated.missingFromVersion}.`,
      fromVersion,
    );
  }

  const validation = validateCourseDocumentJSON(migrated.document);
  if (!validation.ok) {
    return {
      ok: false,
      code: "invalid_migrated_document",
      message: "Migrated Scaffold document does not match the current schema.",
      fromVersion,
      toVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      issues: [...validation.issues],
    };
  }

  return {
    ok: true,
    document: migrated.document,
    fromVersion,
    toVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
    migrated: fromVersion !== SCAFFOLD_DOCUMENT_FORMAT_VERSION,
  };
}

function migrationError(
  code: CourseDocumentMigrationErrorCode,
  message: string,
  fromVersion: number | null,
): CourseDocumentMigrationResult {
  return {
    ok: false,
    code,
    message,
    fromVersion,
    toVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
  };
}

function cloneJSONContent(content: unknown): JSONContent | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return null;
  }

  try {
    const serialized = JSON.stringify(content);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized) as unknown;
    return isJSONContent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isJSONContent(value: unknown): value is JSONContent {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
