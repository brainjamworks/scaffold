// @vitest-environment jsdom

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION, type EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { describe, expect, it } from "vite-plus/test";

import {
  createCourseDocumentAuthoringEnvironment,
  createCourseDocumentAuthoringExtensions,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import {
  canonicalizeAuthoringDocument,
  establishAuthoringDocument,
} from "@/document/model/establishment";
import { insertNodeChecked } from "@/document/model/commands/checked-transactions";
import { requireLayerMutationAccessForState } from "@/document/authoring/layers/layer-editing-boundaries";
import { validateStructuralFragment } from "@/document/authoring/structural-clipboard/structural-fragment-validation";
import type { StructuralFragmentContent } from "@/document/authoring/structural-clipboard/structural-fragment-codec";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { createInteractionsFixtureContent } from "@/editor/learner-interaction/workspace/interactions-fixture";

const authoringComposition = createCoreScaffoldAuthoringComposition();
const runtimeComposition = createCoreScaffoldRuntimeComposition();
const authoringExtensions = createCourseDocumentAuthoringExtensions({
  editable: true,
  composition: authoringComposition,
});
const runtimeExtensions = createCourseDocumentRuntimeExtensions({
  composition: runtimeComposition,
});
const authoringSchema = getSchema(authoringExtensions);
const runtimeSchema = getSchema(runtimeExtensions);

describe("mandatory Layer production cutover", () => {
  it("registers one shared Layer grammar and the exact eligible slot expressions", () => {
    for (const [schema, label] of [
      [authoringSchema, "authoring"],
      [runtimeSchema, "runtime/headless"],
    ] as const) {
      expect(schema.nodes["region"]?.spec.content, label).toBe("layer+");
      expect(schema.nodes["cell"]?.spec.content, label).toBe("layer+");
      expect(schema.nodes["section"]?.spec.content, label).toBe(
        "layer+ | (accordion_section_title accordion_section_panel)",
      );
      expect(schema.nodes["accordion_section_panel"]?.spec.content, label).toBe("layer+");
      expect(schema.nodes["layer"]?.spec.content, label).toBe("(paragraph | block | arrangement)+");
    }

    expect(authoringExtensions.filter(({ name }) => name === "layer")).toHaveLength(1);
    expect(runtimeExtensions.filter(({ name }) => name === "layer")).toHaveLength(1);
    expect(authoringExtensions.find(({ name }) => name === "layer")?.config).toHaveProperty(
      "addNodeView",
    );
    expect(runtimeExtensions.find(({ name }) => name === "layer")?.config).toHaveProperty(
      "addNodeView",
    );
  });

  it("establishes the same format-5 factory document in production authoring and runtime schemas", () => {
    const document = productionSlideDocument();
    const courseDocument = document.content?.[0];
    const surface = courseDocument?.content?.find((node) => node.type === "surface");
    const region = surface?.content?.find((node) => node.type === "region");

    expect(courseDocument?.attrs?.["schemaVersion"]).toBe(SCAFFOLD_DOCUMENT_FORMAT_VERSION);
    expect(region?.content?.map(({ type }) => type)).toEqual(["layer"]);
    expect(region?.content?.[0]?.content?.map(({ type }) => type)).toEqual(["paragraph"]);

    const authoring = establish(document, "authoring");
    const runtime = establish(document, "runtime");
    expect(authoring.status).toBe("supported");
    expect(runtime.status).toBe("supported");
    if (authoring.status !== "supported" || runtime.status !== "supported") return;
    expect(authoring.workingDocument).toEqual(runtime.workingDocument);
    expect(authoring.format).toEqual({ fromVersion: 5, currentVersion: 5, migrated: false });
  });

  it("establishes the repository interactions fixture through the production schema", () => {
    const document = createInteractionsFixtureContent();

    expect(establish(document, "authoring")).toMatchObject({ status: "supported" });
    expect(establish(document, "runtime")).toMatchObject({ status: "supported" });
  });

  it("refuses the former format without wrapping or rewriting the caller's document", () => {
    const document = productionSlideDocument();
    document.content![0]!.attrs!["schemaVersion"] = 4;
    const before = structuredClone(document);

    expect(establish(document, "authoring")).toEqual({
      status: "unsupported-core-format",
      documentVersion: 4,
      supportedVersion: 5,
      message: "Scaffold document format v4 is older than this runtime supports.",
    });
    expect(document).toEqual(before);
  });

  it("preserves an unavailable feature root inside its owning Layer", () => {
    const document = productionSlideDocument();
    requireRegion(document).content = [
      layer("layerRoot001", [
        { type: "future_block", attrs: { id: "futureblk001", data: { answer: 42 } } },
      ]),
    ];

    const result = establish(document, "authoring");
    expect(result).toMatchObject({
      status: "unavailable",
      unavailableContent: [
        {
          kind: "block",
          capabilityId: "future_block",
          stableId: "futureblk001",
        },
      ],
    });
    if (result.status !== "unavailable") return;
    expect(requireRegion(result.workingDocument).content?.[0]?.content?.[0]).toMatchObject({
      type: "unavailable_block",
      attrs: {
        id: "futureblk001",
        capabilityId: "future_block",
        original: { type: "future_block" },
      },
    });
  });

  it("reports owner-policy facts after recursive schema validation", () => {
    const document = productionSlideDocument();
    const region = requireRegion(document);
    region.content = [
      layer("layerRoot001", [
        {
          type: "grid",
          attrs: { id: "gridOuter001", columnWidths: [1] },
          content: [
            {
              type: "cell",
              attrs: { id: "cellOuter001", verticalPosition: "top" },
              content: [
                layer("layerCell001", [
                  {
                    type: "grid",
                    attrs: { id: "gridInner001", columnWidths: [1] },
                    content: [
                      {
                        type: "cell",
                        attrs: { id: "cellInner001", verticalPosition: "top" },
                        content: [
                          layer("layerDeep001", [
                            { type: "paragraph", attrs: { id: "paraDeep0001" } },
                          ]),
                        ],
                      },
                    ],
                  },
                ]),
              ],
            },
          ],
        },
      ]),
    ];

    const result = establish(document, "authoring");
    expect(result).toEqual({
      status: "invalid",
      issues: [
        expect.objectContaining({
          kind: "layer-context",
          code: "layer-content-incompatible",
          diagnostic: expect.objectContaining({
            reason: "layer-content-incompatible",
            ownerId: "cellOuter001",
            layerId: "layerCell001",
            rule: "grid-not-allowed-in-cell",
          }),
        }),
      ],
    });
  });

  it("preserves conflicting Layer identity facts without encoding them in prose", () => {
    const document = productionSlideDocument();
    const rootLayer = requireRegion(document).content?.[0];
    const paragraph = rootLayer?.content?.[0];
    if (!rootLayer?.attrs?.["id"] || !paragraph) throw new Error("Missing initial Layer body.");
    paragraph.attrs = { ...paragraph.attrs, id: rootLayer.attrs["id"] };

    expect(establish(document, "authoring")).toEqual({
      status: "invalid",
      issues: [
        expect.objectContaining({
          kind: "layer-identity",
          code: "node-id-duplicated",
          diagnostic: expect.objectContaining({
            reason: "node-id-duplicated",
            id: rootLayer.attrs["id"],
            firstNodeType: "layer",
            duplicateNodeType: "paragraph",
            firstPath: expect.any(Array),
            duplicatePath: expect.any(Array),
          }),
        }),
      ],
    });
  });

  it("refuses contextual checked inserts before touching the supplied transform", () => {
    const document = productionSlideDocument();
    const region = requireRegion(document);
    const regionId = region.attrs?.["id"] as EmbeddedNodeId;
    const layerId = region.content?.[0]?.attrs?.["id"] as EmbeddedNodeId;
    const parsed = authoringSchema.nodeFromJSON(document);
    const mountedLayer = findNodeById(parsed, layerId);
    const accordion = authoringComposition.capabilities.layouts.registry
      .getById("accordion")
      ?.createContent();
    if (!accordion) throw new Error("Missing built-in Accordion factory.");
    assignMissingIds(accordion);
    const titleJson = accordion.content?.[0]?.content?.[0];
    if (!titleJson) throw new Error("Missing Accordion title fixture.");
    const title = authoringSchema.nodeFromJSON(titleJson);
    const tr = new Transform(parsed);
    const before = tr.doc.toJSON();
    const position = mountedLayer.pos + mountedLayer.node.nodeSize - 1;
    const layerAccess = {
      kind: "explicit-layer" as const,
      blockDefinitions: authoringComposition.capabilities.blocks.registry,
      layoutDefinitions: authoringComposition.capabilities.layouts.registry,
      destination: { ownerId: regionId, layerId, capturedSlotId: regionId },
    };

    expect(insertNodeChecked({ tr, pos: position, node: title, layerAccess })).toEqual({
      ok: false,
      issue: {
        kind: "layer",
        code: "layer_context_refused",
        message: "Layer mutation refused: layer-content-incompatible.",
        diagnostic: expect.objectContaining({
          reason: "layer-content-incompatible",
          ownerId: regionId,
          layerId,
          contentType: "accordion_section_title",
          rule: "feature-private-content",
        }),
      },
    });
    expect(tr.steps).toHaveLength(0);
    expect(tr.doc.toJSON()).toEqual(before);

    const normal = insertNodeChecked({
      tr,
      pos: position,
      node: authoringSchema.node("paragraph", { id: "normalpara01" }),
      layerAccess,
    });
    expect(normal.ok).toBe(true);
    if (!normal.ok) return;
    const saved = canonicalizeAuthoringDocument({
      workingDocument: normal.tr.doc.toJSON(),
      capabilities: {
        blocks: authoringComposition.capabilities.blocks.registry,
        layouts: authoringComposition.capabilities.layouts.registry,
        surfaces: authoringComposition.capabilities.surfaces.registry,
      },
      authoringSchema,
      expectedRequiresScaffoldPlus: false,
      productAccess: { scaffoldPlusAuthorized: false },
    });
    expect(saved).toMatchObject({
      status: "ready",
    });
  });

  it("validates the first Layer-bearing Page candidate before touching its transaction", () => {
    const editor = new Editor({
      extensions: authoringExtensions,
      content: createScaffoldDocumentContent({ mode: "page" }),
    });
    const access = requireLayerMutationAccessForState(editor.state);
    expect(access.kind).toBe("layer-capable-document");

    const tabs = authoringComposition.capabilities.layouts.registry
      .getById("tabs")
      ?.createContent();
    const accordion = authoringComposition.capabilities.layouts.registry
      .getById("accordion")
      ?.createContent();
    if (!tabs || !accordion) throw new Error("Missing built-in Layout factories.");
    const tabsLayer = tabs.content?.[0]?.content?.[0];
    const accordionTitle = accordion.content?.[0]?.content?.[0];
    if (!tabsLayer || !accordionTitle) throw new Error("Missing built-in Section content.");
    tabsLayer.content = [accordionTitle];
    assignMissingIds(tabs);

    const position = findFirstNode(editor.state.doc, "paragraph").pos;
    const rejected = editor.state.tr;
    const before = rejected.doc.toJSON();
    expect(
      insertNodeChecked({
        tr: rejected,
        pos: position,
        node: editor.schema.nodeFromJSON(tabs),
        layerAccess: access,
      }),
    ).toEqual({
      ok: false,
      issue: {
        kind: "layer",
        code: "layer_context_refused",
        message: "Layer mutation refused: layer-content-incompatible.",
        diagnostic: expect.objectContaining({
          reason: "layer-content-incompatible",
          contentType: "accordion_section_title",
          rule: "feature-private-content",
        }),
      },
    });
    expect(rejected.steps).toHaveLength(0);
    expect(rejected.doc.toJSON()).toEqual(before);

    const validTabs = authoringComposition.capabilities.layouts.registry
      .getById("tabs")
      ?.createContent();
    if (!validTabs) throw new Error("Missing built-in Tabs factory.");
    assignMissingIds(validTabs);
    const inserted = insertNodeChecked({
      tr: editor.state.tr,
      pos: position,
      node: editor.schema.nodeFromJSON(validTabs),
      layerAccess: access,
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.tr.steps).toHaveLength(1);
    expect(
      canonicalizeAuthoringDocument({
        workingDocument: inserted.tr.doc.toJSON(),
        capabilities: {
          blocks: authoringComposition.capabilities.blocks.registry,
          layouts: authoringComposition.capabilities.layouts.registry,
          surfaces: authoringComposition.capabilities.surfaces.registry,
        },
        authoringSchema,
        expectedRequiresScaffoldPlus: false,
        productAccess: { scaffoldPlusAuthorized: false },
      }),
    ).toMatchObject({ status: "ready" });
    editor.destroy();
  });

  it("refuses a nested private-content structural fragment with the canonical diagnostic", () => {
    const tabs = authoringComposition.capabilities.layouts.registry
      .getById("tabs")
      ?.createContent();
    const accordion = authoringComposition.capabilities.layouts.registry
      .getById("accordion")
      ?.createContent();
    if (!tabs || !accordion) throw new Error("Missing built-in Layout factories.");
    const tabsLayer = tabs.content?.[0]?.content?.[0];
    const accordionTitle = accordion.content?.[0]?.content?.[0];
    if (!tabsLayer || !accordionTitle) throw new Error("Missing built-in Section content.");
    tabsLayer.content = [accordionTitle];
    assignMissingIds(tabs);

    expect(
      validateStructuralFragment({
        fragment: {
          protocol: "scaffold.structural-fragment",
          version: 1,
          documentFormatVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          rootKind: "layout",
          content: tabs as StructuralFragmentContent,
        },
        schema: authoringSchema,
        capabilities: {
          blocks: authoringComposition.capabilities.blocks.registry,
          layouts: authoringComposition.capabilities.layouts.registry,
          surfaces: authoringComposition.capabilities.surfaces.registry,
        },
      }),
    ).toEqual({
      status: "refused",
      reason: "layer_context_invalid",
      path: expect.any(Array),
      diagnostic: expect.objectContaining({
        reason: "layer-content-incompatible",
        contentType: "accordion_section_title",
        rule: "feature-private-content",
      }),
    });
  });

  it("does not flatten a broken validation dependency into an expected document issue", () => {
    const environment = createCourseDocumentAuthoringEnvironment({
      composition: authoringComposition,
    });
    const state = getCourseDocumentAuthoringEnvironmentState(environment);
    const document = productionSlideDocument();
    const tabs = authoringComposition.capabilities.layouts.registry
      .getById("tabs")
      ?.createContent();
    if (!tabs) throw new Error("Missing built-in Tabs factory.");
    requireRegion(document).content = [layer("layerRoot001", [tabs])];
    assignMissingIds(document);

    expect(() =>
      establishAuthoringDocument({
        canonicalDocument: document,
        capabilities: {
          ...state.capabilities,
          layouts: {
            getById: state.capabilities.layouts.getById,
            getForNode: () => {
              throw new Error("injected layout registry defect");
            },
          },
        },
        authoringSchema: state.schema,
        productAccess: { scaffoldPlusAuthorized: false },
      }),
    ).toThrow("injected layout registry defect");
  });
});

function establish(document: JSONContent, renderer: "authoring" | "runtime") {
  const composition = renderer === "authoring" ? authoringComposition : runtimeComposition;
  return establishAuthoringDocument({
    canonicalDocument: document,
    capabilities: {
      blocks: composition.capabilities.blocks.registry,
      layouts: composition.capabilities.layouts.registry,
      surfaces: composition.capabilities.surfaces.registry,
    },
    authoringSchema: renderer === "authoring" ? authoringSchema : runtimeSchema,
    productAccess: { scaffoldPlusAuthorized: false },
  });
}

function productionSlideDocument(): JSONContent {
  const surfaceId = "surface00001" as EmbeddedNodeId;
  const document = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId,
    initialCourseSectionTitle: "Layer cutover",
  });
  const courseDocument = document.content?.[0];
  const courseSection = courseDocument?.content?.find((node) => node.type === "courseSection");
  if (!courseDocument || !courseSection) throw new Error("Missing production Course Structure.");
  courseDocument.content = [
    courseSection,
    slideContentSurfaceDefinition.createSurface({ surfaceId }),
  ];
  assignMissingIds(document);
  return document;
}

function requireRegion(document: JSONContent): JSONContent {
  const surface = document.content?.[0]?.content?.find((node) => node.type === "surface");
  const region = surface?.content?.find((node) => node.type === "region");
  if (!region) throw new Error("Missing production Region.");
  return region;
}

function layer(id: string, content: readonly JSONContent[]): JSONContent {
  return { type: "layer", attrs: { id }, content: [...content] };
}

function assignMissingIds(root: JSONContent): void {
  let next = 1;
  const visit = (node: JSONContent) => {
    if (node.type !== "doc" && node.type !== "text" && !node.attrs?.["id"]) {
      node.attrs = { ...node.attrs, id: `generated${String(next++).padStart(3, "0")}` };
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(root);
}

function findNodeById(
  document: ReturnType<typeof authoringSchema.nodeFromJSON>,
  id: EmbeddedNodeId,
): { node: ProseMirrorNode; pos: number } {
  let match: { node: ProseMirrorNode; pos: number } | null = null;
  document.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    match = { node, pos };
    return false;
  });
  if (!match) throw new Error(`Missing node "${id}".`);
  return match as { node: ProseMirrorNode; pos: number };
}

function findFirstNode(
  document: ProseMirrorNode,
  nodeType: string,
): { node: ProseMirrorNode; pos: number; end: number } {
  let match: { node: ProseMirrorNode; pos: number; end: number } | null = null;
  document.descendants((node, pos) => {
    if (node.type.name !== nodeType) return true;
    match = { node, pos, end: pos + node.nodeSize - 1 };
    return false;
  });
  if (!match) throw new Error(`Missing ${nodeType}.`);
  return match as { node: ProseMirrorNode; pos: number; end: number };
}
