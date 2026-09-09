import { z } from "zod";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import type { DocumentCapabilityLookups } from "./document-capability-lookups";
import { establishAuthoringDocument } from "./establish-authoring-document";
import { checkLearnerProjectionReadiness } from "./learner-projection-readiness";

const schema = new Schema({
  nodes: {
    doc: { content: "courseDocument" },
    courseDocument: {
      attrs: {
        id: { default: null },
        schemaVersion: { default: 4 },
        requiresScaffoldPlus: { default: false },
        mode: { default: "page" },
        surfaceSize: { default: "fluid" },
        overflowMode: { default: "grow" },
        theme: { default: null },
      },
      content: "surface+",
    },
    surface: {
      attrs: { id: { default: null }, variant: { default: null }, settings: { default: {} } },
      content: "(known_block | unavailable_block)+",
    },
    known_block: { attrs: { id: { default: null }, data: { default: null } } },
    unavailable_block: {
      attrs: { id: { default: null }, capabilityId: {}, original: {} },
      atom: true,
    },
    text: {},
  },
});
const capabilities: DocumentCapabilityLookups = {
  blocks: {
    getByNodeType: (type) =>
      type === "known_block"
        ? ({
            nodeType: type,
            title: "Known",
            attrSchemas: { data: z.object({ count: z.number() }) },
          } as never)
        : undefined,
  },
  layouts: { getById: () => undefined, getForNode: () => undefined },
  surfaces: {
    get: (id) =>
      id === "known-surface" ? ({ id, settingsSchema: z.object({}) } as never) : undefined,
  },
};
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;

describe("checkLearnerProjectionReadiness", () => {
  it("returns canonical content only when every surviving root is supported", () => {
    const canonical = documentWith({
      type: "known_block",
      attrs: { id: "block0000001", data: { count: 1 } },
    });

    expect(
      checkLearnerProjectionReadiness({
        workingDocument: canonical,
        capabilities,
        authoringSchema: schema,
        expectedRequiresScaffoldPlus: false,
        productAccess: coreProductAccess,
      }),
    ).toEqual({
      status: "supported",
      canonicalDocument: canonical,
    });
  });

  it("withholds canonical JSON when unavailable content survives", () => {
    const established = establishAuthoringDocument({
      canonicalDocument: documentWith({ type: "plus_block", attrs: { id: "plusblock001" } }),
      capabilities,
      authoringSchema: schema,
      productAccess: coreProductAccess,
    });
    if (established.status !== "unavailable") throw new Error("fixture did not establish");

    const readiness = checkLearnerProjectionReadiness({
      workingDocument: established.workingDocument,
      capabilities,
      authoringSchema: schema,
      expectedRequiresScaffoldPlus: false,
      productAccess: coreProductAccess,
    });

    expect(readiness).toEqual({
      status: "unavailable-content",
      unavailableContent: established.unavailableContent,
    });
    expect(readiness).not.toHaveProperty("canonicalDocument");
  });

  it("preserves invalid working-content failures", () => {
    const malformed = documentWith({
      type: "known_block",
      attrs: { id: "block0000001", data: { count: "bad" } },
    });
    expect(
      checkLearnerProjectionReadiness({
        workingDocument: malformed,
        capabilities,
        authoringSchema: schema,
        expectedRequiresScaffoldPlus: false,
        productAccess: coreProductAccess,
      }),
    ).toEqual({
      status: "invalid",
      issues: [expect.objectContaining({ code: "invalid_capability_attrs" })],
    });
  });

  it("returns the distinct Plus-required refusal without projecting learner content", () => {
    const canonical = documentWith({
      type: "known_block",
      attrs: { id: "block0000001", data: { count: 1 } },
    });
    (canonical.content as Array<{ attrs?: Record<string, unknown> }>)[0]!.attrs![
      "requiresScaffoldPlus"
    ] = true;
    const projectionMustNotRun: DocumentCapabilityLookups = {
      blocks: {
        getByNodeType: () => {
          throw new Error("learner projection must not run");
        },
      },
      layouts: { getById: () => undefined, getForNode: () => undefined },
      surfaces: { get: () => undefined },
    };

    expect(
      checkLearnerProjectionReadiness({
        workingDocument: canonical,
        capabilities: projectionMustNotRun,
        authoringSchema: schema,
        expectedRequiresScaffoldPlus: true,
        productAccess: coreProductAccess,
      }),
    ).toEqual({ status: "requires-scaffold-plus" });
  });

  it("preserves the unsupported Core format result from real future-version input", () => {
    const future = documentWith({
      type: "known_block",
      attrs: { id: "block0000001", data: { count: 1 } },
    });
    (future.content as Array<Record<string, unknown>>)[0]!.attrs = {
      id: "course000001",
      schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1,
    };

    expect(
      checkLearnerProjectionReadiness({
        workingDocument: future,
        capabilities,
        authoringSchema: schema,
        expectedRequiresScaffoldPlus: false,
        productAccess: coreProductAccess,
      }),
    ).toMatchObject({
      status: "unsupported-core-format",
      documentVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1,
      supportedVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
    });
  });
});

function documentWith(block: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: "course000001",
          schemaVersion: 5,
          requiresScaffoldPlus: false,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
          theme: createDefaultPersistedCourseTheme(),
        },
        content: [
          {
            type: "surface",
            attrs: { id: "surface00001", variant: "known-surface", settings: {} },
            content: [block],
          },
        ],
      },
    ],
  };
}
