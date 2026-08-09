import type { JSONContent } from "@tiptap/core";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import {
  cloneCourseDocumentJSON,
  migrateCourseDocumentJSON,
  readCourseDocumentFormatVersion,
  type CourseDocumentMigrationResult,
} from "@/document/model/validation";
import { findCourseDocument } from "@/document/model/validation/migrations/helpers";

import type {
  DocumentEstablishmentIssue,
  EstablishedDocumentFormat,
} from "./document-establishment";

type CourseDocumentMigrationOperation = (content: unknown) => CourseDocumentMigrationResult;

export type DocumentFormatEstablishmentResult =
  | {
      readonly status: "current";
      readonly canonicalDocument: JSONContent;
      readonly format: EstablishedDocumentFormat & { readonly migrated: false };
    }
  | {
      readonly status: "migrated";
      readonly canonicalDocument: JSONContent;
      readonly format: EstablishedDocumentFormat & { readonly migrated: true };
    }
  | {
      readonly status: "invalid";
      readonly issues: readonly DocumentEstablishmentIssue[];
    }
  | {
      readonly status: "unsupported-core-format";
      readonly documentVersion: number;
      readonly supportedVersion: number;
      readonly message: string;
    };

export function establishDocumentFormat(
  content: unknown,
  migrate: CourseDocumentMigrationOperation = migrateCourseDocumentJSON,
): DocumentFormatEstablishmentResult {
  const canonicalDocument = cloneCourseDocumentJSON(content);
  if (!canonicalDocument) {
    return invalidFormat(
      "invalid_json",
      "Scaffold document content must be JSON object content.",
      [],
    );
  }

  const fromVersion = readCourseDocumentFormatVersion(canonicalDocument);
  if (fromVersion === null) {
    return invalidFormat(
      "invalid_document_version",
      "Scaffold document format version could not be read.",
      courseDocumentVersionPath(canonicalDocument),
    );
  }

  if (fromVersion > SCAFFOLD_DOCUMENT_FORMAT_VERSION) {
    return {
      status: "unsupported-core-format",
      documentVersion: fromVersion,
      supportedVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      message: `Scaffold document format v${fromVersion} is newer than this runtime supports.`,
    };
  }

  if (fromVersion === SCAFFOLD_DOCUMENT_FORMAT_VERSION) {
    return {
      status: "current",
      canonicalDocument,
      format: {
        fromVersion,
        currentVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        migrated: false,
      },
    };
  }

  const migration = migrate(canonicalDocument);
  if (!migration.ok) {
    return invalidFormat(migration.code, migration.message, courseDocumentPath(canonicalDocument));
  }

  return {
    status: "migrated",
    canonicalDocument: migration.document,
    format: {
      fromVersion: migration.fromVersion,
      currentVersion: migration.toVersion,
      migrated: true,
    },
  };
}

function invalidFormat(
  code: string,
  message: string,
  path: readonly (string | number)[],
): DocumentFormatEstablishmentResult {
  return { status: "invalid", issues: [{ code, message, path }] };
}

function courseDocumentVersionPath(content: JSONContent): readonly (string | number)[] {
  const courseDocument = findCourseDocument(content);
  return courseDocument ? ["content", courseDocument.index, "attrs", "schemaVersion"] : [];
}

function courseDocumentPath(content: JSONContent): readonly (string | number)[] {
  const courseDocument = findCourseDocument(content);
  return courseDocument ? ["content", courseDocument.index] : [];
}
