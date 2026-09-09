import { z } from "zod";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import type { DocumentCapabilityLookups } from "./document-capability-lookups";
import { establishAuthoringDocument } from "./establish-authoring-document";

const schema = createSchema();
const capabilities = createCapabilities();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;
const plusProductAccess = { scaffoldPlusAuthorized: true } as const;

describe("establishAuthoringDocument", () => {
  it.each([
    ["block", plusBlock(), "unavailable_block"],
    ["layout", plusLayout(), "unavailable_layout"],
    ["surface", plusSurface(), "unavailable_surface"],
  ] as const)(
    "projects one unavailable %s root with an owned opaque original",
    (kind, root, type) => {
      const canonical = documentWith(root);
      const result = establishAuthoringDocument({
        canonicalDocument: canonical,
        capabilities,
        authoringSchema: schema,
        productAccess: coreProductAccess,
      });

      expect(result.status).toBe("unavailable");
      if (result.status !== "unavailable") return;
      expect(result.unavailableContent).toEqual([
        expect.objectContaining({
          kind,
          capabilityId: capabilityId(root),
          stableId: root.attrs!.id,
        }),
      ]);
      const wrapper = findNode(result.workingDocument, type)!;
      expect(wrapper.attrs?.["original"]).toEqual(root);
      expect(wrapper.attrs?.["original"]).not.toBe(root);

      root.attrs!.private = "mutated after establishment";
      expect(wrapper.attrs?.["original"]).not.toEqual(root);
    },
  );

  it("keeps descendants of an unavailable root opaque", () => {
    const root = plusSurface();
    root.content = [{ type: "malformed_private", attrs: { id: "bad" } }];

    const result = establishAuthoringDocument({
      canonicalDocument: documentWith(root),
      capabilities,
      authoringSchema: schema,
      productAccess: coreProductAccess,
    });

    expect(result.status).toBe("unavailable");
  });

  it("accepts supported content and rejects malformed known capability attrs", () => {
    expect(
      establishAuthoringDocument({
        canonicalDocument: documentWith(knownBlock()),
        capabilities,
        authoringSchema: schema,
        productAccess: coreProductAccess,
      }).status,
    ).toBe("supported");

    const malformed = knownBlock();
    malformed.attrs!.data = { count: "wrong" };
    expect(
      establishAuthoringDocument({
        canonicalDocument: documentWith(malformed),
        capabilities,
        authoringSchema: schema,
        productAccess: coreProductAccess,
      }),
    ).toEqual({
      status: "invalid",
      issues: [expect.objectContaining({ code: "invalid_capability_attrs" })],
    });
  });

  it("refuses a Plus-required document before capability projection when access is absent", () => {
    const canonical = documentWith(knownBlock());
    canonical.content![0]!.attrs!.requiresScaffoldPlus = true;
    const projectionMustNotRun: DocumentCapabilityLookups = {
      blocks: {
        getByNodeType: () => {
          throw new Error("capability projection must not run");
        },
      },
      layouts: {
        getById: () => {
          throw new Error("capability projection must not run");
        },
        getForNode: () => {
          throw new Error("capability projection must not run");
        },
      },
      surfaces: {
        get: () => {
          throw new Error("capability projection must not run");
        },
      },
    };

    expect(
      establishAuthoringDocument({
        canonicalDocument: canonical,
        capabilities: projectionMustNotRun,
        authoringSchema: schema,
        productAccess: coreProductAccess,
      }),
    ).toEqual({ status: "requires-scaffold-plus" });
  });

  it("continues to supported or unavailable after Plus access succeeds", () => {
    const supported = documentWith(knownBlock());
    supported.content![0]!.attrs!.requiresScaffoldPlus = true;
    const unavailable = documentWith(plusBlock());
    unavailable.content![0]!.attrs!.requiresScaffoldPlus = true;

    expect(
      establishAuthoringDocument({
        canonicalDocument: supported,
        capabilities,
        authoringSchema: schema,
        productAccess: plusProductAccess,
      }).status,
    ).toBe("supported");
    expect(
      establishAuthoringDocument({
        canonicalDocument: unavailable,
        capabilities,
        authoringSchema: schema,
        productAccess: plusProductAccess,
      }).status,
    ).toBe("unavailable");
  });

  it("preserves future and malformed-current results before the Plus access gate", () => {
    const future = documentWith(knownBlock());
    future.content![0]!.attrs!.schemaVersion = SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1;
    future.content![0]!.attrs!.requiresScaffoldPlus = true;
    const malformed = documentWith(knownBlock());
    malformed.content![0]!.attrs!.requiresScaffoldPlus = "yes";

    expect(
      establishAuthoringDocument({
        canonicalDocument: future,
        capabilities,
        authoringSchema: schema,
        productAccess: coreProductAccess,
      }),
    ).toMatchObject({ status: "unsupported-core-format" });
    expect(
      establishAuthoringDocument({
        canonicalDocument: malformed,
        capabilities,
        authoringSchema: schema,
        productAccess: coreProductAccess,
      }),
    ).toEqual({
      status: "invalid",
      issues: [expect.objectContaining({ code: "invalid_course_document_attrs" })],
    });
  });

  it("rejects malformed unknown roots and canonical compatibility nodes", () => {
    const malformed = plusBlock();
    malformed.attrs!.id = "short";
    expect(
      establishAuthoringDocument({
        canonicalDocument: documentWith(malformed),
        capabilities,
        authoringSchema: schema,
        productAccess: coreProductAccess,
      }),
    ).toEqual({
      status: "invalid",
      issues: [expect.objectContaining({ code: "invalid_embedded_node_id" })],
    });

    expect(
      establishAuthoringDocument({
        canonicalDocument: documentWith({
          type: "unavailable_block",
          attrs: { id: "wrapper00001", capabilityId: "plus_block", original: plusBlock() },
        }),
        capabilities,
        authoringSchema: schema,
        productAccess: coreProductAccess,
      }),
    ).toEqual({
      status: "invalid",
      issues: [expect.objectContaining({ code: "canonical_compatibility_node" })],
    });
  });

  it("rejects duplicate understood root IDs while ignoring opaque descendant IDs", () => {
    const duplicate = documentWith(knownBlock());
    duplicate.content![0]!.content![0]!.content!.push(knownBlock());

    expect(
      establishAuthoringDocument({
        canonicalDocument: duplicate,
        capabilities,
        authoringSchema: schema,
        productAccess: coreProductAccess,
      }),
    ).toEqual({
      status: "invalid",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "duplicate_embedded_node_id" }),
      ]),
    });
  });

  it("uses the exact schema to reject a kind in an illegal position", () => {
    const nestedSurface = knownSurface();
    nestedSurface.content = [plusSurface()];

    expect(
      establishAuthoringDocument({
        canonicalDocument: documentWithRootSurface(nestedSurface),
        capabilities,
        authoringSchema: schema,
        productAccess: coreProductAccess,
      }),
    ).toEqual({
      status: "invalid",
      issues: [expect.objectContaining({ code: "invalid_authoring_schema" })],
    });
  });

  it("rejects invalid Course attributes and Course Structure before mounting", () => {
    const invalidAttrs = documentWith(knownBlock());
    delete invalidAttrs.content?.[0]?.attrs?.theme;
    expect(
      establishAuthoringDocument({
        canonicalDocument: invalidAttrs,
        capabilities,
        authoringSchema: schema,
        productAccess: coreProductAccess,
      }),
    ).toEqual({
      status: "invalid",
      issues: [expect.objectContaining({ code: "invalid_course_document_attrs" })],
    });

    const invalidStructure = documentWith(knownBlock());
    invalidStructure.content![0]!.content!.push(knownSurface());
    expect(
      establishAuthoringDocument({
        canonicalDocument: invalidStructure,
        capabilities,
        authoringSchema: schema,
        productAccess: coreProductAccess,
      }),
    ).toEqual({
      status: "invalid",
      issues: [expect.objectContaining({ code: "invalid_course_structure" })],
    });
  });
});

function createSchema(): Schema {
  const id = { default: null };
  return new Schema({
    nodes: {
      doc: { content: "courseDocument" },
      courseDocument: {
        attrs: {
          id,
          schemaVersion: { default: 5 },
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
        attrs: { id, variant: { default: null }, options: { default: {} } },
        content: "(known_block | unavailable_block)+",
      },
      known_block: { attrs: { id, data: { default: null } }, group: "block" },
      unavailable_block: {
        attrs: { id, capabilityId: {}, original: {} },
        group: "block",
        atom: true,
      },
      unavailable_layout: { attrs: { id, capabilityId: {}, original: {} }, atom: true },
      unavailable_surface: { attrs: { id, capabilityId: {}, original: {} }, atom: true },
      text: {},
    },
  });
}

function createCapabilities(): DocumentCapabilityLookups {
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
    layouts: {
      getById: (id) => (id === "known-layout" ? ({ id } as never) : undefined),
      getForNode: () => undefined,
    },
    surfaces: {
      get: (id) =>
        id === "known-surface" ? ({ id, settingsSchema: z.object({}) } as never) : undefined,
    },
  };
}

function documentWith(root: TestNode): TestNode {
  return root.type === "surface"
    ? documentWithRootSurface(root)
    : documentWithRootSurface({ ...knownSurface(), content: [root] });
}

function documentWithRootSurface(surface: TestNode): TestNode {
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
        content: [surface],
      },
    ],
  };
}

function knownSurface(): TestNode {
  return {
    type: "surface",
    attrs: { id: "surface00001", variant: "known-surface", settings: {} },
    content: [knownBlock()],
  };
}

function knownBlock(): TestNode {
  return { type: "known_block", attrs: { id: "block0000001", data: { count: 1 } } };
}

function plusBlock(): TestNode {
  return { type: "plus_block", attrs: { id: "plusblock001", private: "secret" } };
}

function plusLayout(): TestNode {
  return {
    type: "layout",
    attrs: { id: "pluslayout01", variant: "plus-layout" },
    content: [plusBlock()],
  };
}

function plusSurface(): TestNode {
  return {
    type: "surface",
    attrs: { id: "plussurface1", variant: "plus-surface" },
    content: [plusBlock()],
  };
}

function capabilityId(node: TestNode): string {
  return node.type === "layout" || node.type === "surface"
    ? String(node.attrs!.variant)
    : node.type;
}

function findNode(root: unknown, type: string): Record<string, any> | undefined {
  const stack = [root];
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;
    const node = value as Record<string, any>;
    if (node.type === type) return node;
    if (Array.isArray(node.content)) stack.push(...node.content);
  }
  return undefined;
}

interface TestNode {
  type: string;
  attrs?: Record<string, any>;
  content?: TestNode[];
}
