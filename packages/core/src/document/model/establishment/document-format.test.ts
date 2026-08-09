import type { JSONContent } from "@tiptap/core";
import { describe, expect, it, vi } from "vite-plus/test";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { migrateCourseDocumentJSON } from "@/document/model/validation/migrations";

import { establishDocumentFormat } from "./document-format";

function documentAtVersion(schemaVersion: number): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: "course000001",
          schemaVersion,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
        },
        content: [],
      },
    ],
  };
}

describe("document format establishment", () => {
  it("owns current-format JSON without invoking migration", () => {
    const source = documentAtVersion(SCAFFOLD_DOCUMENT_FORMAT_VERSION);
    const migration = vi.fn(migrateCourseDocumentJSON);

    const result = establishDocumentFormat(source, migration);

    expect(result).toEqual({
      status: "current",
      canonicalDocument: source,
      format: {
        fromVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        currentVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        migrated: false,
      },
    });
    expect(migration).not.toHaveBeenCalled();
    if (result.status !== "current") return;

    expect(result.canonicalDocument).not.toBe(source);
    source.content![0]!.attrs!["mode"] = "slideshow";
    expect(result.canonicalDocument.content?.[0]?.attrs?.["mode"]).toBe("page");
  });

  it("migrates supported older JSON through the ordered migration operation", () => {
    const migration = vi.fn(migrateCourseDocumentJSON);

    const result = establishDocumentFormat(documentAtVersion(1), migration);

    expect(result).toMatchObject({
      status: "migrated",
      canonicalDocument: {
        content: [{ attrs: { schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION } }],
      },
      format: {
        fromVersion: 1,
        currentVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        migrated: true,
      },
    });
    expect(migration).toHaveBeenCalledOnce();
  });

  it("returns an unsupported Core format without migrating future JSON", () => {
    const migration = vi.fn(migrateCourseDocumentJSON);
    const documentVersion = SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1;

    const result = establishDocumentFormat(documentAtVersion(documentVersion), migration);

    expect(result).toEqual({
      status: "unsupported-core-format",
      documentVersion,
      supportedVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      message: `Scaffold document format v${documentVersion} is newer than this runtime supports.`,
    });
    expect(migration).not.toHaveBeenCalled();
  });

  it("returns path-aware invalid issues for malformed format metadata", () => {
    const result = establishDocumentFormat({
      type: "doc",
      content: [{ type: "courseDocument", attrs: { schemaVersion: "not-a-version" } }],
    });

    expect(result).toEqual({
      status: "invalid",
      issues: [
        {
          code: "invalid_document_version",
          message: "Scaffold document format version could not be read.",
          path: ["content", 0, "attrs", "schemaVersion"],
        },
      ],
    });
  });

  it("keeps a failed known migration distinguishable and path-aware", () => {
    const migration = vi.fn(() => ({
      ok: false as const,
      code: "migration_failed" as const,
      message: "Scaffold document v1 could not be migrated. Invalid legacy content.",
      fromVersion: 1,
      toVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
    }));

    const result = establishDocumentFormat(documentAtVersion(1), migration);

    expect(result).toEqual({
      status: "invalid",
      issues: [
        {
          code: "migration_failed",
          message: "Scaffold document v1 could not be migrated. Invalid legacy content.",
          path: ["content", 0],
        },
      ],
    });
    expect(migration).toHaveBeenCalledOnce();
  });
});
