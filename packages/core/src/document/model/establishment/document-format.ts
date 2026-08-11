import type { JSONContent } from "@tiptap/core";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import {
  cloneCourseDocumentJSON,
  findCourseDocument,
  readCourseDocumentFormatVersion,
} from "@/document/model/validation";

import type {
  DocumentEstablishmentIssue,
  EstablishedDocumentFormat,
} from "./document-establishment";

export type DocumentFormatEstablishmentResult =
  | {
      readonly status: "current";
      readonly canonicalDocument: JSONContent;
      readonly format: EstablishedDocumentFormat & { readonly migrated: false };
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

  if (fromVersion !== SCAFFOLD_DOCUMENT_FORMAT_VERSION) {
    const age = fromVersion < SCAFFOLD_DOCUMENT_FORMAT_VERSION ? "older" : "newer";
    return {
      status: "unsupported-core-format",
      documentVersion: fromVersion,
      supportedVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      message: `Scaffold document format v${fromVersion} is ${age} than this runtime supports.`,
    };
  }

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
