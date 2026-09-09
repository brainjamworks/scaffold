import { CircleIcon } from "@phosphor-icons/react";
import { Schema, type NodeSpec } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@scaffold/contracts";
import { createLayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import { mcqBlockDefinition } from "@/editor/blocks/assessment/mcq/mcq-definition";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";

import type {
  StructuralFragmentContent,
  StructuralFragmentJsonObject,
  StructuralFragmentJsonValue,
  StructuralFragmentRootKind,
  StructuralFragmentV1Envelope,
} from "./structural-fragment-codec";
import { validateStructuralFragment } from "./structural-fragment-validation";

const IDS = {
  block: "block0000001",
  child: "child0000001",
  duplicate: "same00000001",
  layout: "layout000001",
  layer: "layer0000001",
  section: "section00001",
  surface: "surface00001",
  choices: "child0000001",
  optionOne: "option000001",
  optionTwo: "option000002",
} as const;

const strictCoreBlock = {
  ...defineBlock({ nodeType: "core_block", title: "Core block" }),
  attrSchemas: {
    data: z.object({ label: z.string() }).strict(),
    settings: z.object({ enabled: z.boolean() }).strict(),
    options: z.object({ tone: z.enum(["plain", "strong"]) }).strict(),
  },
};

const strictPlusBlock = {
  ...defineBlock({ nodeType: "plus_block", title: "Plus block" }),
  attrSchemas: {
    data: z.object({ label: z.string() }).strict(),
    settings: z.object({ enabled: z.boolean() }).strict(),
    options: z.object({ tone: z.enum(["plain", "strong"]) }).strict(),
  },
};

const coreBlocks = createBlockRegistry([strictCoreBlock, mcqBlockDefinition]);
const plusBlocks = createBlockRegistry([strictCoreBlock, strictPlusBlock, mcqBlockDefinition]);

const coreLayouts = createLayoutRegistry([
  {
    id: "core-layout",
    title: "Core layout",
    description: "Core layout",
    icon: CircleIcon,
    configuration: {
      attr: "options",
      schema: z.object({ columns: z.number().int().positive() }).strict(),
      controls: [],
    },
    section: {
      label: "Section",
      addLabel: "Add section",
      configuration: {
        attr: "options",
        schema: z.object({ label: z.string() }).strict(),
        controls: [],
      },
      create: () => ({ type: "section" }),
    },
    createContent: () => ({ type: "layout", attrs: { variant: "core-layout" } }),
  },
]);

const plusLayouts = createLayoutRegistry([
  ...coreLayouts.definitions,
  {
    id: "plus-layout",
    title: "Plus layout",
    description: "Plus layout",
    icon: CircleIcon,
    section: {
      label: "Section",
      addLabel: "Add section",
      create: () => ({ type: "section" }),
    },
    createContent: () => ({ type: "layout", attrs: { variant: "plus-layout" } }),
  },
]);

const coreSurfaces = createSurfaceVariantRegistry([
  {
    id: "core-slide",
    modes: ["slideshow"],
    defaultForModes: ["slideshow"],
    title: "Core slide",
    description: "Core slide",
    settingsSchema: z.object({ theme: z.enum(["light", "dark"]) }).strict(),
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: "core-slide", settings: { theme: "light" } },
      content: [coreBlock()],
    }),
  },
  {
    id: "fixed-slide",
    modes: ["slideshow"],
    title: "Fixed slide",
    description: "Fixed slide",
    settingsSchema: z.object({ theme: z.enum(["light", "dark"]) }).strict(),
    structurePolicy: { fixedChildren: [{ type: "core_block" }] },
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: "fixed-slide", settings: { theme: "light" } },
      content: [coreBlock()],
    }),
  },
]);

const plusSurfaces = createSurfaceVariantRegistry([
  ...coreSurfaces.definitions,
  {
    id: "plus-slide",
    modes: ["slideshow"],
    title: "Plus slide",
    description: "Plus slide",
    settingsSchema: z.object({ theme: z.enum(["light", "dark"]) }).strict(),
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: "plus-slide", settings: { theme: "light" } },
      content: [plusBlock()],
    }),
  },
]);

describe("structural fragment destination validation", () => {
  it("accepts Core-to-Core and Core-to-Plus Blocks without changing source JSON", () => {
    const source = coreBlock();
    const sourceAttrs = attrsOf(source);
    Object.freeze(source);
    const snapshot = JSON.stringify(source);

    const coreResult = validateStructuralFragment({
      fragment: envelope("block", source),
      schema: createSchema(false),
      capabilities: capabilities("core"),
    });
    const plusResult = validateStructuralFragment({
      fragment: envelope("block", source),
      schema: createSchema(true),
      capabilities: capabilities("plus"),
    });

    expect(coreResult).toMatchObject({
      status: "ok",
      value: { rootKind: "block", source },
    });
    expect(plusResult).toMatchObject({ status: "ok" });
    expect(JSON.stringify(source)).toBe(snapshot);
    if (coreResult.status !== "ok") throw new Error("Expected valid Core block");
    expect(coreResult.value.source).toBe(source);
    expect(coreResult.value.node.toJSON()).toEqual(source);
    expect(Object.isFrozen(sourceAttrs)).toBe(true);
  });

  it("accepts Plus-to-Plus roots and refuses an unavailable Plus root in Core", () => {
    expect(
      validateStructuralFragment({
        fragment: envelope("block", plusBlock()),
        schema: createSchema(true),
        capabilities: capabilities("plus"),
      }),
    ).toMatchObject({ status: "ok" });

    expect(
      validateStructuralFragment({
        fragment: envelope("block", plusBlock()),
        schema: createSchema(false),
        capabilities: capabilities("core"),
      }),
    ).toEqual({ status: "refused", reason: "unavailable_block", path: [] });
  });

  it("atomically refuses unavailable descendants before schema parsing", () => {
    const source = coreBlock({
      content: [
        {
          type: "unavailable_block",
          attrs: {
            id: IDS.child,
            capabilityId: "plus_block",
            original: plusBlock(),
          },
        },
      ],
    });

    expect(
      validateStructuralFragment({
        fragment: envelope("block", source),
        schema: createSchema(false),
        capabilities: capabilities("core"),
      }),
    ).toEqual({
      status: "refused",
      reason: "unavailable_block",
      path: ["content", 0],
    });
    expect(childrenOf(source)[0]?.type).toBe("unavailable_block");
  });

  it.each([
    ["unavailable_layout", "unavailable_layout"],
    ["unavailable_surface", "unavailable_surface"],
  ] as const)("refuses %s compatibility nodes anywhere", (type, reason) => {
    const source = coreBlock({
      content: [{ type, attrs: { id: IDS.child, capabilityId: "private", original: {} } }],
    });

    expect(
      validateStructuralFragment({
        fragment: envelope("block", source),
        schema: createSchema(true),
        capabilities: capabilities("plus"),
      }),
    ).toMatchObject({ status: "refused", reason, path: ["content", 0] });
  });

  it("requires the declared root kind to agree with the mounted root", () => {
    expect(validate("layout", coreBlock())).toEqual({
      status: "refused",
      reason: "root_kind_mismatch",
      path: [],
    });
    expect(validate("block", { type: "paragraph", attrs: { id: IDS.block } })).toEqual({
      status: "refused",
      reason: "root_kind_mismatch",
      path: [],
    });
    expect(
      validate("layout", { ...layout(), attrs: { ...attrsOf(layout()), variant: "missing" } }),
    ).toMatchObject({ status: "refused", reason: "unavailable_layout", path: [] });
    expect(validate("surface", surface("missing"))).toMatchObject({
      status: "refused",
      reason: "unavailable_surface",
      path: [],
    });
  });

  it("strictly validates every mounted Block attr surface", () => {
    for (const [attr, value] of [
      ["data", { label: "Core", extra: true }],
      ["settings", { enabled: "yes" }],
      ["options", { tone: "unknown" }],
    ] as const) {
      const source = coreBlock({ attrs: { ...attrsOf(coreBlock()), [attr]: value } });
      expect(validate("block", source)).toEqual({
        status: "refused",
        reason: "invalid_block_attrs",
        path: ["attrs", attr],
      });
    }
  });

  it.each([
    ["malformed private assessment attrs", { correctOptionId: 42 }],
    ["a dangling private answer reference", { correctOptionId: "option000099" }],
  ])("refuses an assessment Block with %s", (_label, assessment) => {
    expect(validate("block", mcqBlock({ assessment }))).toEqual({
      status: "refused",
      reason: "invalid_assessment_contract",
      path: [],
    });
  });

  it("accepts an assessment Block whose private answer references a mounted child", () => {
    expect(validate("block", mcqBlock())).toMatchObject({ status: "ok" });
  });

  it("validates Layout variants plus root and section configuration", () => {
    expect(validate("layout", layout())).toMatchObject({ status: "ok" });
    expect(
      validate("layout", layout({ attrs: { ...attrsOf(layout()), options: { columns: 0 } } })),
    ).toEqual({
      status: "refused",
      reason: "invalid_layout_attrs",
      path: ["attrs", "options"],
    });
    expect(
      validate(
        "layout",
        layout({
          content: [
            {
              type: "section",
              attrs: { id: IDS.section, options: { label: 42 } },
              content: [layer([coreBlock()])],
            },
          ],
        }),
      ),
    ).toEqual({
      status: "refused",
      reason: "invalid_layout_attrs",
      path: ["content", 0, "attrs", "options"],
    });
  });

  it("validates Surface settings and fixed-child structure", () => {
    expect(validate("surface", surface("core-slide"))).toMatchObject({ status: "ok" });
    expect(
      validate(
        "surface",
        surface("core-slide", { attrs: { settings: { theme: "light", extra: true } } }),
      ),
    ).toEqual({
      status: "refused",
      reason: "invalid_surface_settings",
      path: ["attrs", "settings"],
    });
    expect(
      validate("surface", surface("fixed-slide", { content: [layout({ id: IDS.layout })] })),
    ).toEqual({
      status: "refused",
      reason: "invalid_surface_structure",
      path: ["content"],
    });
  });

  it("refuses malformed nodes and exact-schema topology failures", () => {
    const malformed = coreBlock({ content: [{ attrs: { id: IDS.child } } as never] });
    expect(validate("block", malformed)).toEqual({
      status: "refused",
      reason: "malformed_node",
      path: ["content", 0],
    });

    expect(
      validate(
        "layout",
        layout({ content: [coreBlock({ attrs: { ...attrsOf(coreBlock()), id: IDS.child } })] }),
      ),
    ).toMatchObject({ status: "refused", reason: "schema_mismatch" });
  });

  it("refuses missing, malformed and duplicate current embedded IDs", () => {
    expect(validate("block", coreBlock({ attrs: { ...attrsOf(coreBlock()), id: null } }))).toEqual({
      status: "refused",
      reason: "missing_embedded_node_id",
      path: ["attrs", "id"],
    });
    expect(
      validate("block", coreBlock({ attrs: { ...attrsOf(coreBlock()), id: "not-an-id" } })),
    ).toEqual({
      status: "refused",
      reason: "invalid_embedded_node_id",
      path: ["attrs", "id"],
    });
    expect(
      validate(
        "block",
        coreBlock({
          attrs: { ...attrsOf(coreBlock()), id: IDS.duplicate },
          content: [
            plusBlock({
              attrs: { ...attrsOf(plusBlock()), id: IDS.duplicate },
            }),
          ],
        }),
        "plus",
      ),
    ).toEqual({
      status: "refused",
      reason: "duplicate_embedded_node_id",
      path: ["content", 0, "attrs", "id"],
    });

    expect(
      validate(
        "layout",
        layout({
          content: [coreBlock({ attrs: { ...attrsOf(coreBlock()), id: "not-an-id" } })],
        }),
      ),
    ).toEqual({
      status: "refused",
      reason: "invalid_embedded_node_id",
      path: ["content", 0, "attrs", "id"],
    });
  });

  it("accepts mounted Layout and Surface roots in the Plus destination", () => {
    expect(validate("layout", layout({ variant: "plus-layout" }), "plus")).toMatchObject({
      status: "ok",
    });
    expect(
      validate("surface", surface("plus-slide", { content: [plusBlock()] }), "plus"),
    ).toMatchObject({ status: "ok" });
  });
});

function validate(
  rootKind: StructuralFragmentRootKind,
  content: StructuralFragmentContent,
  target: "core" | "plus" = "core",
) {
  return validateStructuralFragment({
    fragment: envelope(rootKind, content),
    schema: createSchema(target === "plus"),
    capabilities: capabilities(target),
  });
}

function capabilities(target: "core" | "plus") {
  return target === "core"
    ? { blocks: coreBlocks, layouts: coreLayouts, surfaces: coreSurfaces }
    : { blocks: plusBlocks, layouts: plusLayouts, surfaces: plusSurfaces };
}

function envelope(
  rootKind: StructuralFragmentRootKind,
  content: StructuralFragmentContent,
): StructuralFragmentV1Envelope {
  return {
    protocol: "scaffold.structural-fragment",
    version: 1,
    documentFormatVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
    rootKind,
    content,
  };
}

function coreBlock(overrides: Partial<StructuralFragmentContent> = {}): StructuralFragmentContent {
  return {
    type: "core_block",
    attrs: {
      id: IDS.block,
      data: { label: "Core" },
      settings: { enabled: true },
      options: { tone: "plain" },
    },
    ...overrides,
  };
}

function plusBlock(overrides: Partial<StructuralFragmentContent> = {}): StructuralFragmentContent {
  return {
    type: "plus_block",
    attrs: {
      id: IDS.child,
      data: { label: "Plus" },
      settings: { enabled: true },
      options: { tone: "strong" },
    },
    ...overrides,
  };
}

function mcqBlock({
  assessment = { correctOptionId: IDS.optionOne },
}: {
  assessment?: StructuralFragmentJsonValue;
} = {}): StructuralFragmentContent {
  return {
    type: "mcq",
    attrs: { id: IDS.block, settings: {}, assessment },
    content: [
      {
        type: "assessment_choices_group",
        attrs: { id: IDS.choices },
        content: [
          { type: "selectable_choice", attrs: { id: IDS.optionOne } },
          { type: "selectable_choice", attrs: { id: IDS.optionTwo } },
        ],
      },
    ],
  };
}

function layout(
  input: {
    id?: string;
    variant?: string;
    attrs?: Record<string, unknown>;
    content?: readonly StructuralFragmentContent[];
  } = {},
): StructuralFragmentContent {
  const variant = input.variant ?? "core-layout";
  return {
    type: "layout",
    attrs: {
      id: input.id ?? IDS.layout,
      variant,
      options: variant === "core-layout" ? { columns: 2 } : {},
      ...input.attrs,
    },
    content: input.content ?? [
      {
        type: "section",
        attrs: { id: IDS.section, options: { label: "Main" } },
        content: [layer([coreBlock()])],
      },
    ],
  };
}

function surface(
  variant: string,
  overrides: {
    attrs?: Record<string, unknown>;
    content?: readonly StructuralFragmentContent[];
  } = {},
): StructuralFragmentContent {
  return {
    type: "surface",
    attrs: {
      id: IDS.surface,
      variant,
      settings: { theme: "light" },
      ...overrides.attrs,
    },
    content: overrides.content ?? [coreBlock()],
  };
}

function createSchema(includePlus: boolean): Schema {
  const id = { default: null };
  const attrs = {
    id,
    data: { default: {} },
    settings: { default: {} },
    options: { default: {} },
  };
  const nodes: Record<string, NodeSpec> = {
    doc: { content: "surface+" },
    surface: {
      attrs: { id, variant: { default: null }, settings: { default: {} } },
      content: "(block | arrangement)+",
    },
    layout: {
      group: "block arrangement",
      attrs: { id, variant: { default: null }, options: { default: {} } },
      content: "section+",
    },
    section: { attrs: { id, options: { default: {} } }, content: "layer+" },
    layer: { attrs: { id }, content: "block+" },
    core_block: { group: "block", attrs, content: "block*" },
    mcq: {
      group: "block",
      attrs: { id, settings: { default: {} }, assessment: { default: {} } },
      content: "assessment_choices_group",
    },
    assessment_choices_group: { attrs: { id }, content: "selectable_choice+" },
    selectable_choice: { attrs: { id } },
    paragraph: { group: "block", attrs: { id }, content: "text*" },
    unavailable_block: compatibilityNodeSpec(),
    unavailable_layout: compatibilityNodeSpec(),
    unavailable_surface: compatibilityNodeSpec(),
    text: {},
  };
  if (includePlus) nodes["plus_block"] = { group: "block", attrs, content: "block*" };
  return new Schema({ nodes });
}

function layer(content: readonly StructuralFragmentContent[]): StructuralFragmentContent {
  return { type: "layer", attrs: { id: IDS.layer }, content };
}

function compatibilityNodeSpec() {
  return {
    group: "block",
    atom: true,
    attrs: {
      id: { default: null },
      capabilityId: { default: null },
      original: { default: null },
    },
  };
}

function attrsOf(node: StructuralFragmentContent): StructuralFragmentJsonObject {
  const attrs = node["attrs"];
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) {
    throw new Error("Expected fixture attrs");
  }
  return attrs as StructuralFragmentJsonObject;
}

function childrenOf(node: StructuralFragmentContent): readonly StructuralFragmentContent[] {
  const content = node["content"];
  if (!Array.isArray(content)) return [];
  return content as readonly StructuralFragmentContent[];
}
