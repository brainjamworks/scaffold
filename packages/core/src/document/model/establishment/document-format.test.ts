import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";

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
  it("owns a cloned current-format JSON document", () => {
    const source = documentAtVersion(SCAFFOLD_DOCUMENT_FORMAT_VERSION);
    const result = establishDocumentFormat(source);

    expect(result).toEqual({
      status: "current",
      canonicalDocument: source,
      format: {
        fromVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        currentVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        migrated: false,
      },
    });
    if (result.status !== "current") return;

    expect(result.canonicalDocument).not.toBe(source);
    source.content![0]!.attrs!["mode"] = "slideshow";
    expect(result.canonicalDocument.content?.[0]?.attrs?.["mode"]).toBe("page");
  });

  it("rejects older JSON as unsupported without converting it", () => {
    expect(establishDocumentFormat(documentAtVersion(1))).toEqual({
      status: "unsupported-core-format",
      documentVersion: 1,
      supportedVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      message: "Scaffold document format v1 is older than this runtime supports.",
    });
  });

  it("returns an unsupported Core format without migrating future JSON", () => {
    const documentVersion = SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1;

    const result = establishDocumentFormat(documentAtVersion(documentVersion));

    expect(result).toEqual({
      status: "unsupported-core-format",
      documentVersion,
      supportedVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      message: `Scaffold document format v${documentVersion} is newer than this runtime supports.`,
    });
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

});
