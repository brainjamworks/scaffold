import { z } from "zod";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { canonicalizeAuthoringDocument } from "./canonicalize-authoring-document";
import type { DocumentCapabilityLookups } from "./document-capability-lookups";
import { establishAuthoringDocument } from "./establish-authoring-document";

const schema = testSchema();
const capabilities = testCapabilities();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;
const plusProductAccess = { scaffoldPlusAuthorized: true } as const;

describe("canonicalizeAuthoringDocument", () => {
  it.each([plusBlock(), plusLayout(), plusSurface()])(
    "round-trips an untouched unavailable $type root structurally",
    (unavailableRoot) => {
      const canonical = documentWith(unavailableRoot);
      const established = establishAuthoringDocument({
        canonicalDocument: canonical,
        capabilities,
        authoringSchema: schema,
        productAccess: coreProductAccess,
      });
      expect(established.status).toBe("unavailable");
      if (established.status !== "unavailable") return;

      const result = canonicalizeAuthoringDocument({
        workingDocument: established.workingDocument,
        capabilities,
        authoringSchema: schema,
        expectedRequiresScaffoldPlus: false,
        productAccess: coreProductAccess,
      });

      expect(result).toEqual({
        status: "ready",
        canonicalDocument: canonical,
        unavailableContent: established.unavailableContent,
      });
      if (result.status === "ready") expect(result.canonicalDocument).not.toBe(canonical);
    },
  );

  it("preserves moves and treats deletion as deletion without resurrection", () => {
    const canonical = documentWithTwoBlocks(plusBlock(), knownBlock("block0000002"));
    const established = establishAuthoringDocument({
      canonicalDocument: canonical,
      capabilities,
      authoringSchema: schema,
      productAccess: coreProductAccess,
    });
    if (established.status !== "unavailable") throw new Error("fixture did not establish");
    const surface = (established.workingDocument as any).content[0].content[0];
    surface.content.reverse();

    const moved = canonicalizeAuthoringDocument({
      workingDocument: established.workingDocument,
      capabilities,
      authoringSchema: schema,
      expectedRequiresScaffoldPlus: false,
      productAccess: coreProductAccess,
    });
    expect(
      (moved as any).canonicalDocument.content[0].content[0].content.map((node: any) => node.type),
    ).toEqual(["known_block", "plus_block"]);

    surface.content = surface.content.filter((node: any) => node.type !== "unavailable_block");
    const deleted = canonicalizeAuthoringDocument({
      workingDocument: established.workingDocument,
      capabilities,
      authoringSchema: schema,
      expectedRequiresScaffoldPlus: false,
      productAccess: coreProductAccess,
    });
    expect(
      (deleted as any).canonicalDocument.content[0].content[0].content.map(
        (node: any) => node.type,
      ),
    ).toEqual(["known_block"]);
    expect((deleted as any).unavailableContent).toEqual([]);
  });

  it("rejects wrapper metadata that disagrees with the owned original", () => {
    const established = establishAuthoringDocument({
      canonicalDocument: documentWith(plusBlock()),
      capabilities,
      authoringSchema: schema,
      productAccess: coreProductAccess,
    });
    if (established.status !== "unavailable") throw new Error("fixture did not establish");
    const wrapper = (established.workingDocument as any).content[0].content[0].content[0];
    wrapper.attrs.capabilityId = "different_plus_block";

    expect(
      canonicalizeAuthoringDocument({
        workingDocument: established.workingDocument,
        capabilities,
        authoringSchema: schema,
        expectedRequiresScaffoldPlus: false,
        productAccess: coreProductAccess,
      }),
    ).toEqual({
      status: "invalid",
      issues: [expect.objectContaining({ code: "invalid_compatibility_item" })],
    });
  });

  it("rejects changing the established Scaffold Plus requirement during ordinary editing", () => {
    const canonical = documentWith(knownBlock());
    canonical.content![0]!.attrs!.requiresScaffoldPlus = true;
    const established = establishAuthoringDocument({
      canonicalDocument: canonical,
      capabilities,
      authoringSchema: schema,
      productAccess: plusProductAccess,
    });
    if (established.status !== "supported") throw new Error("fixture did not establish");
    established.workingDocument.content![0]!.attrs!.requiresScaffoldPlus = false;

    expect(
      canonicalizeAuthoringDocument({
        workingDocument: established.workingDocument,
        capabilities,
        authoringSchema: schema,
        expectedRequiresScaffoldPlus: true,
        productAccess: plusProductAccess,
      }),
    ).toEqual({
      status: "invalid",
      issues: [expect.objectContaining({ code: "scaffold_plus_requirement_changed" })],
    });
  });

  it("preserves the unsupported Core format result for real future-version input", () => {
    const future = documentWith(knownBlock());
    future.content![0]!.attrs!.schemaVersion = SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1;

    expect(
      canonicalizeAuthoringDocument({
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

function testSchema(): Schema {
  const id = { default: null };
  return new Schema({
    nodes: {
      doc: { content: "courseDocument" },
      courseDocument: {
        attrs: {
          id,
          schemaVersion: { default: 4 },
          requiresScaffoldPlus: { default: false },
          mode: { default: "page" },
          surfaceSize: { default: "fluid" },
          overflowMode: { default: "grow" },
          theme: { default: null },
        },
        content: "(surface | unavailable_surface)+",
      },
      surface: {
        attrs: { id, variant: { default: null }, settings: { default: {} } },
        content: "(known_block | unavailable_block | layout | unavailable_layout)+",
      },
      layout: {
        attrs: { id, variant: { default: null } },
        content: "(known_block | unavailable_block)+",
      },
      known_block: { attrs: { id, data: { default: null } } },
      unavailable_block: { attrs: { id, capabilityId: {}, original: {} }, atom: true },
      unavailable_layout: { attrs: { id, capabilityId: {}, original: {} }, atom: true },
      unavailable_surface: { attrs: { id, capabilityId: {}, original: {} }, atom: true },
      text: {},
    },
  });
}

function testCapabilities(): DocumentCapabilityLookups {
  return {
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
    layouts: { getById: (id) => (id === "known-layout" ? ({ id } as never) : undefined) },
    surfaces: {
      get: (id) =>
        id === "known-surface" ? ({ id, settingsSchema: z.object({}) } as never) : undefined,
    },
  };
}

function documentWith(root: NodeJson): NodeJson {
  return root.type === "surface"
    ? documentWithSurface(root)
    : documentWithSurface(knownSurface([root]));
}
function documentWithTwoBlocks(...blocks: NodeJson[]): NodeJson {
  return documentWithSurface(knownSurface(blocks));
}
function documentWithSurface(surface: NodeJson): NodeJson {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: "course000001",
          schemaVersion: 4,
          requiresScaffoldPlus: false,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
          theme: createDefaultPersistedCourseTheme(),
        },
        content: [surface],
      },
    ],
  };
}
function knownSurface(content: NodeJson[]): NodeJson {
  return {
    type: "surface",
    attrs: { id: "surface00001", variant: "known-surface", settings: {} },
    content,
  };
}
function knownBlock(id = "block0000001"): NodeJson {
  return { type: "known_block", attrs: { id, data: { count: 1 } } };
}
function plusBlock(): NodeJson {
  return { type: "plus_block", attrs: { id: "plusblock001", private: "secret" } };
}
function plusLayout(): NodeJson {
  return {
    type: "layout",
    attrs: { id: "pluslayout01", variant: "plus-layout" },
    content: [plusBlock()],
  };
}
function plusSurface(): NodeJson {
  return {
    type: "surface",
    attrs: { id: "plussurface1", variant: "plus-surface" },
    content: [plusBlock()],
  };
}
interface NodeJson {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NodeJson[];
}
