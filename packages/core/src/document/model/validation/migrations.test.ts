import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { migrateCourseDocumentJSON, readCourseDocumentFormatVersion } from "./migrations";
import {
  defineCourseDocumentMigration,
  runCourseDocumentMigrationSteps,
  validateCourseDocumentMigrationPlan,
} from "./migration-registry";

function documentWithAttrs(
  attrs: Record<string, unknown> = {
    id: "course000001",
    schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
    mode: "page",
    surfaceSize: "fluid",
    overflowMode: "grow",
    theme: createDefaultPersistedCourseTheme(),
  },
): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs,
        content: [
          {
            type: "surface",
            attrs: { id: "surface00001", variant: "page-default" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}

describe("course document migrations", () => {
  it("rejects documents without an explicit schemaVersion", () => {
    const source = documentWithAttrs({ mode: "page" });

    expect(readCourseDocumentFormatVersion(source)).toBeNull();
    expect(migrateCourseDocumentJSON(source)).toMatchObject({
      ok: false,
      code: "invalid_document_version",
      fromVersion: null,
    });
  });

  it("leaves current v4 documents unchanged", () => {
    const source = documentWithAttrs({
      id: "course000001",
      schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      mode: "page",
      surfaceSize: "fluid",
      overflowMode: "grow",
      theme: createDefaultPersistedCourseTheme(),
    });
    const result = migrateCourseDocumentJSON(source);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.fromVersion).toBe(SCAFFOLD_DOCUMENT_FORMAT_VERSION);
    expect(result.toVersion).toBe(SCAFFOLD_DOCUMENT_FORMAT_VERSION);
    expect(result.migrated).toBe(false);
    expect(result.document).toEqual(source);
  });

  it("rejects future document versions instead of loading them as v1", () => {
    const result = migrateCourseDocumentJSON(
      documentWithAttrs({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1,
        mode: "page",
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "unsupported_document_version",
      fromVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1,
      toVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
    });
  });

  it("rejects non-document JSON", () => {
    expect(migrateCourseDocumentJSON({ type: "paragraph" })).toMatchObject({
      ok: false,
      code: "invalid_document_version",
      fromVersion: null,
    });
  });

  it("runs chained migrations in order for v1-to-vN upgrades", () => {
    const source = documentWithAttrs({
      schemaVersion: 1,
      mode: "page",
      surfaceSize: "fluid",
      overflowMode: "grow",
      migrationTrail: [],
    });

    const result = runCourseDocumentMigrationSteps({
      document: source,
      fromVersion: 1,
      toVersion: 3,
      migrations: [
        defineCourseDocumentMigration({
          from: 1,
          to: 2,
          description: "Fake v1 to v2 test migration.",
          migrate: (document) => stampMigration(document, 2, "v2"),
        }),
        defineCourseDocumentMigration({
          from: 2,
          to: 3,
          description: "Fake v2 to v3 test migration.",
          migrate: (document) => stampMigration(document, 3, "v3"),
        }),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.applied).toEqual([
      { from: 1, to: 2, description: "Fake v1 to v2 test migration." },
      { from: 2, to: 3, description: "Fake v2 to v3 test migration." },
    ]);
    expect(result.document.content?.[0]?.attrs).toMatchObject({
      schemaVersion: 3,
      migrationTrail: ["v2", "v3"],
    });
  });

  it("reports the exact missing migration step in a chained upgrade", () => {
    const result = runCourseDocumentMigrationSteps({
      document: documentWithAttrs({
        schemaVersion: 1,
        mode: "page",
        surfaceSize: "fluid",
        overflowMode: "grow",
      }),
      fromVersion: 1,
      toVersion: 3,
      migrations: [
        defineCourseDocumentMigration({
          from: 1,
          to: 2,
          description: "Fake v1 to v2 test migration.",
          migrate: (document) => stampMigration(document, 2, "v2"),
        }),
      ],
    });

    expect(result).toEqual({ ok: false, missingFromVersion: 2 });
  });

  it("rejects non-sequential migration definitions", () => {
    expect(() =>
      defineCourseDocumentMigration({
        from: 1,
        to: 3,
        description: "Skipped v2.",
        migrate: (document) => document,
      }),
    ).toThrow(/must advance exactly one version/);
  });

  it("enforces append-only production migration plans", () => {
    const v1ToV2 = defineCourseDocumentMigration({
      from: 1,
      to: 2,
      description: "Fake v1 to v2 test migration.",
      migrate: (document) => stampMigration(document, 2, "v2"),
    });
    const v3ToV4 = defineCourseDocumentMigration({
      from: 3,
      to: 4,
      description: "Fake v3 to v4 test migration.",
      migrate: (document) => stampMigration(document, 4, "v4"),
    });

    expect(() => validateCourseDocumentMigrationPlan([v1ToV2, v3ToV4], 3)).toThrow(
      /expected v2->v3 at index 1/,
    );
  });

  it("accepts three append-only migrations for the current v4 baseline", () => {
    const v1ToV2 = defineCourseDocumentMigration({
      from: 1,
      to: 2,
      description: "Fake v1 to v2 test migration.",
      migrate: (document) => stampMigration(document, 2, "v2"),
    });
    const v2ToV3 = defineCourseDocumentMigration({
      from: 2,
      to: 3,
      description: "Fake v2 to v3 test migration.",
      migrate: (document) => stampMigration(document, 3, "v3"),
    });
    const v3ToV4 = defineCourseDocumentMigration({
      from: 3,
      to: 4,
      description: "Fake v3 to v4 test migration.",
      migrate: (document) => stampMigration(document, 4, "v4"),
    });

    expect(validateCourseDocumentMigrationPlan([v1ToV2, v2ToV3, v3ToV4], 4)).toEqual([
      v1ToV2,
      v2ToV3,
      v3ToV4,
    ]);
  });

  it("runs the production v1-to-v2-to-v3-to-v4 migration", () => {
    const result = migrateCourseDocumentJSON(
      documentWithAttrs({
        schemaVersion: 1,
        mode: "page",
        surfaceSize: "fluid",
        overflowMode: "grow",
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      fromVersion: 1,
      toVersion: 4,
      migrated: true,
      document: {
        content: [{ attrs: { schemaVersion: 4, theme: createDefaultPersistedCourseTheme() } }],
      },
    });
  });

  it("runs the production v2-to-v3-to-v4 migration", () => {
    const result = migrateCourseDocumentJSON(
      documentWithAttrs({
        schemaVersion: 2,
        mode: "page",
        surfaceSize: "fluid",
        overflowMode: "grow",
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      fromVersion: 2,
      toVersion: 4,
      migrated: true,
      document: {
        content: [{ attrs: { schemaVersion: 4, theme: createDefaultPersistedCourseTheme() } }],
      },
    });
  });

  it("rejects v0 migration definitions", () => {
    expect(() =>
      defineCourseDocumentMigration({
        from: 0,
        to: 1,
        description: "Fake v0 to v1 test migration.",
        migrate: (document) => document,
      }),
    ).toThrow(/positive safe integer/);
  });
});

function stampMigration(document: JSONContent, schemaVersion: number, label: string): JSONContent {
  const courseDocument = document.content?.find((child) => child.type === "courseDocument");
  const previousTrail = Array.isArray(courseDocument?.attrs?.["migrationTrail"])
    ? courseDocument.attrs["migrationTrail"]
    : [];
  const attrs = {
    ...(courseDocument?.attrs ?? {}),
    schemaVersion,
    migrationTrail: [...previousTrail, label],
  };
  if (courseDocument) {
    courseDocument.attrs = attrs;
  }

  return document;
}
