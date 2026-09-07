import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { ColumnsIcon } from "@phosphor-icons/react";
import { Node, getSchema, type Extensions, type JSONContent } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { TEXT_CONTENT } from "@/document/model/content-model/content-groups";
import { LAYER_NODE_TYPE } from "@/document/model/nodes/structural-node-types";
import type { LayoutDefinition } from "@/editor/arrangements/layout/model/layout-definition";
import { createLayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";

import { createBlankLayer, createLayerWithContent } from "./layer-construction";
import { LayerNode } from "./layer-node";
import { resolveLayerOwnerSlot } from "./layer-owner-slot";
import { validateLayerContext, validateLayerIdentities } from "./layer-validation";

const CANDIDATE_CONTENT_EXPRESSIONS: Readonly<Record<string, string>> = Object.freeze({
  region: "layer+",
  cell: "layer+",
  section: "layer+ | (accordion_section_title accordion_section_panel)",
  accordion_section_panel: "layer+",
});

const authoringComposition = createCoreScaffoldAuthoringComposition();
const runtimeComposition = createCoreScaffoldRuntimeComposition();

const modes = [
  {
    name: "authoring",
    composition: authoringComposition,
    extensions: createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: authoringComposition,
    }),
  },
  {
    name: "runtime",
    composition: runtimeComposition,
    extensions: createCourseDocumentRuntimeExtensions({ composition: runtimeComposition }),
  },
] as const;

describe("Layer construction", () => {
  it("creates explicit stable Layer and paragraph identities for blank content", () => {
    const layer = createBlankLayer();
    const layerId = EmbeddedNodeIdSchema.parse(layer.attrs?.["id"]);
    const paragraphId = EmbeddedNodeIdSchema.parse(layer.content?.[0]?.attrs?.["id"]);

    expect(layer).toMatchObject({
      type: LAYER_NODE_TYPE,
      content: [{ type: "paragraph" }],
    });
    expect(layerId).not.toBe(paragraphId);
  });

  it("preserves supplied content and its identities", () => {
    const supplied = [
      {
        type: "paragraph",
        attrs: { id: embeddedId("paragraph001") },
        content: [{ type: "text", text: "Authored" }],
      },
    ] satisfies JSONContent[];

    const layer = createLayerWithContent(supplied);

    expect(layer.content).toEqual(supplied);
    expect(layer.content?.[0]).toBe(supplied[0]);
    expect(layer.content?.[0]?.attrs?.["id"]).toBe(embeddedId("paragraph001"));
  });

  it("keeps constructor programming defects observable", () => {
    const duplicate = embeddedId("duplicate001");
    expect(() => createBlankLayer({ createId: () => duplicate })).toThrow(
      `Duplicate generated document identity "${duplicate}".`,
    );
    expect(() => createLayerWithContent([])).toThrow(
      "A content Layer requires at least one child.",
    );
    expect(() =>
      createLayerWithContent([{ type: "paragraph", attrs: { id: duplicate } }], {
        createId: () => duplicate,
      }),
    ).toThrow(`Duplicate generated document identity "${duplicate}".`);
  });
});

for (const mode of modes) {
  describe(`Layer candidate in the full ${mode.name} composition`, () => {
    const baselineSchema = getSchema(mode.extensions);
    const schema = getSchema(candidateExtensions(mode.extensions));

    it("compiles only the candidate structural changes and keeps Layer outside public groups", () => {
      expect(Object.keys(schema.nodes)).toEqual([...Object.keys(baselineSchema.nodes), "layer"]);
      expect(schema.nodes[LAYER_NODE_TYPE]?.spec.group).toBeUndefined();
      expect(schema.nodes[LAYER_NODE_TYPE]?.spec.attrs?.["semanticLabel"]?.default).toBeNull();
      expect(schema.nodes[LAYER_NODE_TYPE]?.isAtom).toBe(false);
      expect(schema.nodes[LAYER_NODE_TYPE]?.spec).toMatchObject({
        selectable: false,
        draggable: false,
        isolating: true,
        defining: true,
      });
      expect(schema.nodes["grid"]?.spec.content).toBe("cell+");
      expect(schema.nodes["layout"]?.spec.content).toBe("section+");
      expect(
        mode.composition.capabilities.layouts.registry.getById("tabs")?.section?.compositionSlot,
      ).toEqual({ kind: "direct" });
      expect(
        mode.composition.capabilities.layouts.registry.getById("accordion")?.section
          ?.compositionSlot,
      ).toEqual({ kind: "child", nodeType: "accordion_section_panel" });
    });

    it.each(["region", "cell", "section", "accordion_section_panel"])(
      "%s grammar autofills one Layer and one paragraph but not canonical identities",
      (ownerType) => {
        const owner = schema.nodes[ownerType]?.createAndFill();

        expect(owner).not.toBeNull();
        expect(() => owner?.check()).not.toThrow();
        expect(owner?.childCount).toBe(1);
        expect(owner?.firstChild?.type.name).toBe(LAYER_NODE_TYPE);
        expect(owner?.firstChild?.firstChild?.type.name).toBe("paragraph");
        expect(owner?.firstChild?.attrs["id"]).toBeNull();
        expect(owner?.firstChild?.firstChild?.attrs["id"]).toBeNull();
      },
    );

    it("accepts multiple Layers, multiple ordinary blocks, and nested whole Layouts", () => {
      const f = fixture(schema);
      const callout = requireNode(schema.nodes["callout"]?.createAndFill(), "callout");
      const multiLayerRegion = f.node("region", [
        f.layer(f.paragraph(), callout),
        f.layer(f.paragraph(), f.paragraph()),
      ]);
      const nested = f.layout("tabs", [
        f.section([f.layer(f.layout("paginated", [f.section([f.layer(f.paragraph())])]))]),
      ]);

      expect(() => multiLayerRegion.check()).not.toThrow();
      expect(() => f.layer(nested).check()).not.toThrow();
    });

    it("accepts supported rich text, registered Blocks, and contributed ordinary Blocks", () => {
      const f = fixture(schema);
      const richText = Object.values(schema.nodes)
        .filter((type) => type.isInGroup(TEXT_CONTENT))
        .map((type) => requireNode(type.createAndFill(), type.name));
      const marginalia = f.node("marginalia", [
        f.node("marginalia_gutter", [f.paragraph()]),
        f.node("marginalia_main", [f.paragraph()]),
      ]);
      const registered = f.node("region", [f.layer(...richText, marginalia)]);

      expect(() => registered.check()).not.toThrow();
      expect(
        validateContext(
          registered,
          mode.composition.capabilities.blocks.registry,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([]);

      const TestContributedBlock = Node.create({
        name: "test_contributed_block",
        group: "block",
        content: "paragraph",
      });
      const contributedSchema = getSchema(
        candidateExtensions(mode.extensions, {}, [TestContributedBlock]),
      );
      const contributedFixture = fixture(contributedSchema);
      const contributedBlock = contributedFixture.node("test_contributed_block", [
        contributedFixture.paragraph(),
      ]);
      const contributed = contributedFixture.node("region", [
        contributedFixture.layer(contributedBlock),
      ]);
      const blockDefinitions = {
        getByNodeType: (nodeType: string) =>
          nodeType === "test_contributed_block"
            ? { nodeType, title: "Test contributed Block" }
            : mode.composition.capabilities.blocks.registry.getByNodeType(nodeType),
      };

      expect(() => contributed.check()).not.toThrow();
      expect(
        validateContext(
          contributed,
          blockDefinitions,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([]);
    });

    it("accepts all four physical slots and resolves logical owners separately", () => {
      const f = fixture(schema);
      const regionId = f.nextId();
      const cellId = f.nextId();
      const directSectionId = f.nextId();
      const accordionSectionId = f.nextId();
      const panelId = f.nextId();
      const regionLayerIds = [f.nextId(), f.nextId()];
      const cellLayerId = f.nextId();
      const directLayerId = f.nextId();
      const panelLayerIds = [f.nextId(), f.nextId()];
      const document = f.document([
        f.node(
          "region",
          regionLayerIds.map((id) => f.layerWithId(id, f.paragraph())),
          { id: regionId },
        ),
        f.node("region", [
          f.layer(
            f.grid([
              f.node("cell", [f.layerWithId(cellLayerId, f.paragraph())], { id: cellId }),
              f.node("cell", [f.layer(f.paragraph())]),
            ]),
          ),
        ]),
        f.node("region", [
          f.layer(
            f.layout("tabs", [
              f.section([f.layerWithId(directLayerId, f.paragraph())], { id: directSectionId }),
            ]),
          ),
        ]),
        f.node("region", [
          f.layer(
            f.layout("accordion", [
              f.accordionSection(
                panelLayerIds.map((id) => f.layerWithId(id, f.paragraph())),
                { sectionId: accordionSectionId, panelId },
              ),
            ]),
          ),
        ]),
      ]);

      expect(() => document.check()).not.toThrow();
      expect(
        validateLayerContext({
          document,
          blockDefinitions: mode.composition.capabilities.blocks.registry,
          layoutDefinitions: mode.composition.capabilities.layouts.registry,
        }),
      ).toEqual([]);

      const expected = [
        {
          ownerId: regionId,
          ownerType: "region",
          slotId: regionId,
          slotType: "region",
          layerIds: regionLayerIds,
          directGrid: "allowed",
        },
        {
          ownerId: cellId,
          ownerType: "cell",
          slotId: cellId,
          slotType: "cell",
          layerIds: [cellLayerId],
          directGrid: "forbidden",
        },
        {
          ownerId: directSectionId,
          ownerType: "section",
          slotId: directSectionId,
          slotType: "section",
          layerIds: [directLayerId],
          directGrid: "allowed",
        },
        {
          ownerId: accordionSectionId,
          ownerType: "section",
          slotId: panelId,
          slotType: "accordion_section_panel",
          layerIds: panelLayerIds,
          directGrid: "allowed",
        },
      ] as const;

      for (const item of expected) {
        const resolved = resolveLayerOwnerSlot({
          doc: document,
          ownerId: item.ownerId,
          layoutDefinitions: mode.composition.capabilities.layouts.registry,
        });
        expect(resolved.status).toBe("ready");
        if (resolved.status !== "ready") throw new Error("Expected a resolved Layer owner slot");
        expect(resolved.value.logicalOwner).toMatchObject({
          id: item.ownerId,
          nodeType: item.ownerType,
        });
        expect(resolved.value.physicalSlot).toMatchObject({
          id: item.slotId,
          nodeType: item.slotType,
        });
        expect(document.nodeAt(resolved.value.logicalOwner.pos)).toBe(
          resolved.value.logicalOwner.node,
        );
        expect(document.nodeAt(resolved.value.physicalSlot.pos)).toBe(
          resolved.value.physicalSlot.node,
        );
        expect(resolved.value.physicalSlot.pos === resolved.value.logicalOwner.pos).toBe(
          item.slotId === item.ownerId,
        );
        expect(resolved.value.orderedLayerIds).toEqual(item.layerIds);
        expect(resolved.value.policy).toEqual({
          directGrid: item.directGrid,
          fillOccupants: "exclusive",
        });
      }
    });

    it("rejects empty slots, loose content, direct Layer nesting, and malformed Accordion grammar", () => {
      const f = fixture(schema);
      const paragraph = f.paragraph();
      const layer = f.layer(f.paragraph());
      const title = f.node("accordion_section_title", [f.paragraph()]);
      const panel = f.node("accordion_section_panel", [f.layer(f.paragraph())]);

      for (const json of [
        { type: "region" },
        { type: "region", content: [paragraph.toJSON()] },
        { type: "region", content: [layer.toJSON(), paragraph.toJSON()] },
      ]) {
        expect(() => schema.nodeFromJSON(json).check()).toThrow(RangeError);
      }
      expect(schema.nodes[LAYER_NODE_TYPE]?.validContent(Fragment.from(layer))).toBe(false);
      for (const children of [[title], [panel], [panel, title], [title, layer]]) {
        expect(() => f.node("section", children)).toThrow(RangeError);
      }
    });

    it("returns typed diagnostics for malformed external composition slots", () => {
      const f = fixture(schema);
      const emptyId = f.nextId();
      const looseId = f.nextId();
      const paragraphId = f.nextId();
      const empty = schema.nodeFromJSON({ type: "region", attrs: { id: emptyId } });
      const loose = schema.nodeFromJSON({
        type: "region",
        attrs: { id: looseId },
        content: [{ type: "paragraph", attrs: { id: paragraphId } }],
      });

      expect(
        validateContext(
          empty,
          mode.composition.capabilities.blocks.registry,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([
        {
          reason: "composition-slot-requires-layer",
          ownerId: emptyId,
          ownerType: "region",
          slotId: emptyId,
          slotType: "region",
          slotPath: [],
        },
      ]);
      expect(
        validateContext(
          loose,
          mode.composition.capabilities.blocks.registry,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([
        {
          reason: "composition-slot-child-not-layer",
          ownerId: looseId,
          ownerType: "region",
          slotId: looseId,
          slotType: "region",
          contentType: "paragraph",
          contentPath: [0],
        },
      ]);
    });

    it("diagnoses Layout-variant Section forms that the shared grammar cannot distinguish", () => {
      const f = fixture(schema);
      const tabsSectionId = f.nextId();
      const tabsPanelId = f.nextId();
      const tabsLayerId = f.nextId();
      const tabsLayoutId = f.nextId();
      const accordionSectionId = f.nextId();
      const accordionLayerId = f.nextId();
      const accordionLayoutId = f.nextId();
      const wrongTabs = f.node(
        "layout",
        [
          f.accordionSection([f.layerWithId(tabsLayerId, f.paragraph())], {
            sectionId: tabsSectionId,
            panelId: tabsPanelId,
          }),
        ],
        { id: tabsLayoutId, variant: "tabs" },
      );
      const wrongAccordion = f.node(
        "layout",
        [f.section([f.layerWithId(accordionLayerId, f.paragraph())], { id: accordionSectionId })],
        { id: accordionLayoutId, variant: "accordion" },
      );
      const document = f.document([
        f.node("region", [f.layer(wrongTabs)]),
        f.node("region", [f.layer(wrongAccordion)]),
      ]);

      expect(() => document.check()).not.toThrow();
      const diagnostics = validateContext(
        document,
        mode.composition.capabilities.blocks.registry,
        mode.composition.capabilities.layouts.registry,
      );

      expect(diagnostics).toEqual([
        {
          reason: "section-direct-composition-invalid",
          ownerId: tabsSectionId,
          ownerPath: [0, 0, 0, 0, 0, 0],
          layoutId: tabsLayoutId,
          layoutVariant: "tabs",
          actualChildTypes: ["accordion_section_title", "accordion_section_panel"],
        },
        {
          reason: "section-structure-invalid",
          ownerId: accordionSectionId,
          ownerPath: [0, 0, 1, 0, 0, 0],
          layoutId: accordionLayoutId,
          layoutVariant: "accordion",
          expectedChildTypes: ["accordion_section_title", "accordion_section_panel"],
          actualChildTypes: ["layer"],
        },
        {
          reason: "section-slot-child-wrong-type",
          ownerId: accordionSectionId,
          ownerPath: [0, 0, 1, 0, 0, 0],
          layoutId: accordionLayoutId,
          layoutVariant: "accordion",
          declaredNodeType: "accordion_section_panel",
          actualDirectChildTypes: ["layer"],
        },
        {
          reason: "layer-parent-not-composition-slot",
          layerId: tabsLayerId,
          layerPath: [0, 0, 0, 0, 0, 0, 1, 0],
          parentId: tabsPanelId,
          parentPath: [0, 0, 0, 0, 0, 0, 1],
          parentType: "accordion_section_panel",
        },
        {
          reason: "layer-parent-not-composition-slot",
          layerId: accordionLayerId,
          layerPath: [0, 0, 1, 0, 0, 0, 0],
          parentId: accordionSectionId,
          parentPath: [0, 0, 1, 0, 0, 0],
          parentType: "section",
        },
      ]);
    });

    it("uses actual Layout instance identities for two malformed instances of one variant", () => {
      const f = fixture(schema);
      const firstLayoutId = f.nextId();
      const secondLayoutId = f.nextId();
      const firstSectionId = f.nextId();
      const secondSectionId = f.nextId();
      const malformedSection = (id: EmbeddedNodeId) =>
        schema.nodeFromJSON({
          type: "section",
          attrs: { id },
          content: [{ type: "paragraph", attrs: { id: f.nextId() } }],
        });
      const document = f.document([
        f.node("region", [
          f.layer(
            f.node("layout", [malformedSection(firstSectionId)], {
              id: firstLayoutId,
              variant: "tabs",
            }),
          ),
        ]),
        f.node("region", [
          f.layer(
            f.node("layout", [malformedSection(secondSectionId)], {
              id: secondLayoutId,
              variant: "tabs",
            }),
          ),
        ]),
      ]);

      expect(
        validateContext(
          document,
          mode.composition.capabilities.blocks.registry,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([
        {
          reason: "section-direct-composition-invalid",
          ownerId: firstSectionId,
          ownerPath: [0, 0, 0, 0, 0, 0],
          layoutId: firstLayoutId,
          layoutVariant: "tabs",
          actualChildTypes: ["paragraph"],
        },
        {
          reason: "section-direct-composition-invalid",
          ownerId: secondSectionId,
          ownerPath: [0, 0, 1, 0, 0, 0],
          layoutId: secondLayoutId,
          layoutVariant: "tabs",
          actualChildTypes: ["paragraph"],
        },
      ]);
    });

    it("projects malformed feature-owned Section structure as data and a trusted invariant", () => {
      const f = fixture(schema);
      const sectionId = f.nextId();
      const panel = f.node("accordion_section_panel", [f.layer(f.paragraph())]);
      const title = f.node("accordion_section_title", [f.paragraph()]);
      const reversed = schema.nodeFromJSON({
        type: "section",
        attrs: { id: sectionId },
        content: [panel.toJSON(), title.toJSON()],
      });
      const layoutId = f.nextId();
      const layout = f.node("layout", [reversed], { id: layoutId, variant: "accordion" });
      const document = f.document([f.node("region", [f.layer(layout)])]);

      expect(
        validateContext(
          document,
          mode.composition.capabilities.blocks.registry,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([
        {
          reason: "section-structure-invalid",
          ownerId: sectionId,
          ownerPath: [0, 0, 0, 0, 0, 0],
          layoutId,
          layoutVariant: "accordion",
          expectedChildTypes: ["accordion_section_title", "accordion_section_panel"],
          actualChildTypes: ["accordion_section_panel", "accordion_section_title"],
        },
      ]);
      expect(() =>
        resolveLayerOwnerSlot({
          doc: document,
          ownerId: sectionId,
          layoutDefinitions: mode.composition.capabilities.layouts.registry,
        }),
      ).toThrow("violates declared ordered-children structure");
    });

    it("uses the same structural child-slot resolver for a non-Accordion node name", () => {
      const TestSectionBody = Node.create({
        name: "test_section_body",
        group: "block",
        content: "layer+",
      });
      const TestSectionNest = Node.create({
        name: "test_section_nest",
        group: "block",
        content: "test_section_body",
      });
      const childSchema = getSchema(
        candidateExtensions(
          mode.extensions,
          {
            section: "layer+ | test_section_body+ | test_section_nest | paragraph",
          },
          [TestSectionBody, TestSectionNest],
        ),
      );
      const childSlotDefinition = {
        id: "test-child-slot",
        title: "Test child slot",
        description: "Test-only structural child composition slot",
        icon: ColumnsIcon,
        section: {
          label: "Test section",
          addLabel: "Add test section",
          compositionSlot: { kind: "child", nodeType: "test_section_body" },
          create: () => ({ type: "section" }),
        },
        createContent: () => ({ type: "layout", attrs: { variant: "test-child-slot" } }),
      } satisfies LayoutDefinition;
      const layoutDefinitions = createLayoutRegistry([childSlotDefinition]);
      const f = fixture(childSchema);
      const sectionId = f.nextId();
      const slotId = f.nextId();
      const layerId = f.nextId();
      const valid = f.document([
        f.node("region", [
          f.layer(
            f.layout("test-child-slot", [
              f.node(
                "section",
                [
                  f.node("test_section_body", [f.layerWithId(layerId, f.paragraph())], {
                    id: slotId,
                  }),
                ],
                { id: sectionId },
              ),
            ]),
          ),
        ]),
      ]);

      expect(() => valid.check()).not.toThrow();
      const resolved = resolveLayerOwnerSlot({
        doc: valid,
        ownerId: sectionId,
        layoutDefinitions,
      });
      expect(resolved.status).toBe("ready");
      if (resolved.status !== "ready") throw new Error("Expected test child slot to resolve");
      expect(resolved.value.physicalSlot).toMatchObject({
        id: slotId,
        nodeType: "test_section_body",
      });
      expect(valid.nodeAt(resolved.value.physicalSlot.pos)).toBe(resolved.value.physicalSlot.node);
      expect(resolved.value.physicalSlot.pos).toBeGreaterThan(resolved.value.logicalOwner.pos);
      expect(resolved.value.orderedLayerIds).toEqual([layerId]);

      const malformed = [
        {
          label: "missing",
          section: childSchema.nodeFromJSON({
            type: "section",
            attrs: { id: sectionId },
          }),
          reason: "section-slot-child-missing",
          invariant: "is missing declared slot child",
        },
        {
          label: "wrong type",
          section: childSchema.nodeFromJSON({
            type: "section",
            attrs: { id: sectionId },
            content: [{ type: "paragraph", attrs: { id: f.nextId() } }],
          }),
          reason: "section-slot-child-wrong-type",
          invariant: "expected direct slot child",
        },
        {
          label: "nested only",
          section: childSchema.nodeFromJSON({
            type: "section",
            attrs: { id: sectionId },
            content: [
              {
                type: "test_section_nest",
                attrs: { id: f.nextId() },
                content: [
                  {
                    type: "test_section_body",
                    attrs: { id: slotId },
                    content: [f.layer(f.paragraph()).toJSON()],
                  },
                ],
              },
            ],
          }),
          reason: "section-slot-child-nested",
          invariant: "only at nested path",
        },
        {
          label: "duplicate",
          section: childSchema.nodeFromJSON({
            type: "section",
            attrs: { id: sectionId },
            content: [
              {
                type: "test_section_body",
                attrs: { id: slotId },
                content: [f.layer(f.paragraph()).toJSON()],
              },
              {
                type: "test_section_body",
                attrs: { id: f.nextId() },
                content: [f.layer(f.paragraph()).toJSON()],
              },
            ],
          }),
          reason: "section-slot-child-duplicated",
          invariant: "has 2 direct slot children",
        },
      ] as const;

      for (const entry of malformed) {
        const layout = f.layout("test-child-slot", [entry.section]);
        const document = f.document([f.node("region", [f.layer(layout)])]);
        const diagnostics = validateContext(
          document,
          mode.composition.capabilities.blocks.registry,
          layoutDefinitions,
        );
        const ownerPath = [0, 0, 0, 0, 0, 0];
        const base = {
          ownerId: sectionId,
          ownerPath,
          layoutId: layout.attrs["id"],
          layoutVariant: "test-child-slot",
          declaredNodeType: "test_section_body",
        };
        const expected: unknown[] = [];
        if (entry.label === "missing") {
          expected.push({
            ...base,
            reason: "section-slot-child-missing",
          });
        } else if (entry.label === "wrong type") {
          expected.push({
            ...base,
            reason: "section-slot-child-wrong-type",
            actualDirectChildTypes: ["paragraph"],
          });
        } else if (entry.label === "nested only") {
          const body = entry.section.child(0).child(0);
          const layer = body.child(0);
          expected.push(
            {
              ...base,
              reason: "section-slot-child-nested",
              nestedPaths: [[...ownerPath, 0, 0]],
            },
            {
              reason: "layer-parent-not-composition-slot",
              layerId: layer.attrs["id"],
              layerPath: [...ownerPath, 0, 0, 0],
              parentId: body.attrs["id"],
              parentPath: [...ownerPath, 0, 0],
              parentType: "test_section_body",
            },
          );
        } else {
          expected.push({
            ...base,
            reason: "section-slot-child-duplicated",
            directChildIndexes: [0, 1],
          });
          for (let index = 0; index < 2; index += 1) {
            const body = entry.section.child(index);
            const layer = body.child(0);
            expected.push({
              reason: "layer-parent-not-composition-slot",
              layerId: layer.attrs["id"],
              layerPath: [...ownerPath, index, 0],
              parentId: body.attrs["id"],
              parentPath: [...ownerPath, index],
              parentType: "test_section_body",
            });
          }
        }
        expect(diagnostics, entry.label).toEqual(expected);
        expect(
          () =>
            resolveLayerOwnerSlot({
              doc: document,
              ownerId: sectionId,
              layoutDefinitions,
            }),
          entry.label,
        ).toThrow(entry.invariant);
      }
    });

    it("diagnoses private fields directly inside Layer with offending paths and types", () => {
      const f = fixture(schema);
      const title = f.node("accordion_section_title", [f.paragraph()]);
      const panelLayer = f.layer(f.paragraph());
      const panel = f.node("accordion_section_panel", [panelLayer]);
      const outerLayer = f.layer(title, panel);
      const region = f.node("region", [outerLayer]);

      expect(() => region.check()).not.toThrow();
      expect(
        validateContext(
          region,
          mode.composition.capabilities.blocks.registry,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([
        {
          reason: "layer-content-incompatible",
          ownerId: region.attrs["id"],
          layerId: outerLayer.attrs["id"],
          contentPath: [0, 0],
          contentType: "accordion_section_title",
          rule: "feature-private-content",
        },
        {
          reason: "layer-content-incompatible",
          ownerId: region.attrs["id"],
          layerId: outerLayer.attrs["id"],
          contentPath: [0, 1],
          contentType: "accordion_section_panel",
          rule: "feature-private-content",
        },
        {
          reason: "layer-parent-not-composition-slot",
          layerId: panelLayer.attrs["id"],
          layerPath: [0, 1, 0],
          parentId: panel.attrs["id"],
          parentPath: [0, 1],
          parentType: "accordion_section_panel",
        },
      ]);
    });

    it("rejects a private Block field as direct Layer content", () => {
      const f = fixture(schema);
      const main = f.node("marginalia_main", [f.paragraph()]);
      const layer = f.layer(main);
      const region = f.node("region", [layer]);

      expect(() => region.check()).not.toThrow();
      expect(mode.composition.capabilities.blocks.registry.getByNodeType("marginalia_main")).toBe(
        undefined,
      );
      expect(
        validateContext(
          region,
          mode.composition.capabilities.blocks.registry,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([
        {
          reason: "layer-content-incompatible",
          ownerId: region.attrs["id"],
          layerId: layer.attrs["id"],
          contentPath: [0, 0],
          contentType: "marginalia_main",
          rule: "feature-private-content",
        },
      ]);
    });

    it("rejects every Layer whose immediate parent is not a declared composition slot", () => {
      const f = fixture(schema);
      const innerLayer = f.layer(f.paragraph());
      const panel = f.node("accordion_section_panel", [innerLayer]);
      const main = f.node("marginalia_main", [panel]);
      const marginalia = f.node("marginalia", [f.node("marginalia_gutter", [f.paragraph()]), main]);
      const document = f.document([f.node("region", [f.layer(marginalia)])]);

      expect(() => document.check()).not.toThrow();
      expect(
        validateContext(
          document,
          mode.composition.capabilities.blocks.registry,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([
        {
          reason: "layer-parent-not-composition-slot",
          layerId: innerLayer.attrs["id"],
          layerPath: [0, 0, 0, 0, 0, 1, 0, 0],
          parentId: panel.attrs["id"],
          parentPath: [0, 0, 0, 0, 0, 1, 0],
          parentType: "accordion_section_panel",
        },
      ]);
    });

    it("reports a root Layer without inventing an owner", () => {
      const f = fixture(schema);
      const layer = f.layer(f.paragraph());

      expect(
        validateContext(
          layer,
          mode.composition.capabilities.blocks.registry,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([
        {
          reason: "layer-parent-missing",
          layerId: layer.attrs["id"],
          layerPath: [],
        },
      ]);
    });

    it("reports unavailable Layout definitions and preserves the Layout instance identity", () => {
      const f = fixture(schema);
      const sectionId = f.nextId();
      const layerId = f.nextId();
      const layoutId = f.nextId();
      const layout = f.node(
        "layout",
        [f.section([f.layerWithId(layerId, f.paragraph())], { id: sectionId })],
        { id: layoutId, variant: "unknown-layout" },
      );

      expect(
        validateContext(
          layout,
          mode.composition.capabilities.blocks.registry,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([
        {
          reason: "layout-definition-unavailable",
          ownerId: sectionId,
          ownerPath: [0],
          layoutId,
          layoutVariant: "unknown-layout",
        },
        {
          reason: "layer-parent-not-composition-slot",
          layerId,
          layerPath: [0, 0],
          parentId: sectionId,
          parentPath: [0],
          parentType: "section",
        },
      ]);
    });

    it("reports direct structural content while retaining valid nested owner outcomes", () => {
      const f = fixture(schema);
      const outerRegionId = f.nextId();
      const outerLayerId = f.nextId();
      const innerRegionId = f.nextId();
      const innerLayerId = f.nextId();
      const region = schema.nodeFromJSON({
        type: "region",
        attrs: { id: outerRegionId },
        content: [
          {
            type: "layer",
            attrs: { id: outerLayerId },
            content: [
              {
                type: "region",
                attrs: { id: innerRegionId },
                content: [
                  {
                    type: "layer",
                    attrs: { id: innerLayerId },
                    content: [{ type: "paragraph", attrs: { id: f.nextId() } }],
                  },
                ],
              },
            ],
          },
        ],
      });

      expect(
        validateContext(
          region,
          mode.composition.capabilities.blocks.registry,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([
        {
          reason: "layer-content-incompatible",
          ownerId: outerRegionId,
          layerId: outerLayerId,
          contentPath: [0, 0],
          contentType: "region",
          rule: "direct-structural-content",
        },
      ]);
    });

    it("diagnoses direct Grid-in-Cell and mixed fill siblings independently", () => {
      const f = fixture(schema);
      const directGrid = f.grid([
        f.node("cell", [f.layer(f.paragraph())]),
        f.node("cell", [f.layer(f.paragraph())]),
      ]);
      const cellLayer = f.layer(directGrid);
      const cell = f.node("cell", [cellLayer]);
      const mixedGrid = f.grid([
        f.node("cell", [f.layer(f.paragraph())]),
        f.node("cell", [f.layer(f.paragraph())]),
      ]);
      const mixedLayer = f.layer(f.paragraph(), mixedGrid);
      const region = f.node("region", [mixedLayer]);

      expect(() => cell.check()).not.toThrow();
      expect(() => region.check()).not.toThrow();
      expect(
        validateContext(
          cell,
          mode.composition.capabilities.blocks.registry,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([
        {
          reason: "layer-content-incompatible",
          ownerId: cell.attrs["id"],
          layerId: cellLayer.attrs["id"],
          contentPath: [0, 0],
          contentType: "grid",
          rule: "grid-not-allowed-in-cell",
        },
      ]);
      expect(
        validateContext(
          region,
          mode.composition.capabilities.blocks.registry,
          mode.composition.capabilities.layouts.registry,
        ),
      ).toEqual([
        {
          reason: "layer-content-incompatible",
          ownerId: region.attrs["id"],
          layerId: mixedLayer.attrs["id"],
          contentPath: [0, 1],
          contentType: "grid",
          rule: "fill-occupant-must-be-exclusive",
        },
      ]);
    });

    it("reports each Layer and direct paragraph identity failure with required facts", () => {
      const f = fixture(schema);
      const duplicate = f.nextId();
      const region = schema.nodeFromJSON({
        type: "region",
        attrs: { id: f.nextId() },
        content: [
          {
            type: "layer",
            attrs: { id: null },
            content: [{ type: "paragraph", attrs: { id: duplicate } }],
          },
          {
            type: "layer",
            attrs: { id: "not-valid" },
            content: [
              { type: "paragraph", attrs: { id: duplicate } },
              { type: "paragraph", attrs: { id: null } },
            ],
          },
        ],
      });

      expect(validateLayerIdentities(region)).toEqual([
        { reason: "node-id-missing", nodeType: "layer", path: [0] },
        {
          reason: "node-id-invalid",
          nodeType: "layer",
          path: [1],
          actualValue: "not-valid",
        },
        {
          reason: "node-id-duplicated",
          id: duplicate,
          firstNodeType: "paragraph",
          firstPath: [0, 0],
          duplicateNodeType: "paragraph",
          duplicatePath: [1, 0],
        },
        { reason: "node-id-missing", nodeType: "paragraph", path: [1, 1] },
      ]);
    });

    it("returns owner lookup failures as typed data with their facts", () => {
      const f = fixture(schema);
      const regionId = f.nextId();
      const surfaceId = f.nextId();
      const document = f.document([f.node("region", [f.layer(f.paragraph())], { id: regionId })], {
        surfaceId,
      });
      const missingId = f.nextId();

      expect(
        resolveLayerOwnerSlot({
          doc: document,
          ownerId: missingId,
          layoutDefinitions: mode.composition.capabilities.layouts.registry,
        }),
      ).toEqual({
        status: "error",
        error: { reason: "owner-missing", requestedOwnerId: missingId },
      });
      expect(
        resolveLayerOwnerSlot({
          doc: document,
          ownerId: surfaceId,
          layoutDefinitions: mode.composition.capabilities.layouts.registry,
        }),
      ).toEqual({
        status: "error",
        error: { reason: "unsupported-owner", targetId: surfaceId, actualNodeType: "surface" },
      });
    });

    it("does not flatten broken trusted resolver invariants", () => {
      const f = fixture(schema);
      const duplicateId = f.nextId();
      const duplicateDocument = f.document([
        f.node("region", [f.layer(f.paragraph())], { id: duplicateId }),
        f.node("region", [f.layer(f.paragraph())], { id: duplicateId }),
      ]);
      expect(() =>
        resolveLayerOwnerSlot({
          doc: duplicateDocument,
          ownerId: duplicateId,
          layoutDefinitions: mode.composition.capabilities.layouts.registry,
        }),
      ).toThrow(`Duplicate document identity "${duplicateId}".`);

      const duplicateLayerId = f.nextId();
      const duplicateLayerOwnerId = f.nextId();
      const duplicateLayerDocument = f.document([
        f.node(
          "region",
          [
            f.layerWithId(duplicateLayerId, f.paragraph()),
            f.layerWithId(duplicateLayerId, f.paragraph()),
          ],
          { id: duplicateLayerOwnerId },
        ),
      ]);
      expect(() =>
        resolveLayerOwnerSlot({
          doc: duplicateLayerDocument,
          ownerId: duplicateLayerOwnerId,
          layoutDefinitions: mode.composition.capabilities.layouts.registry,
        }),
      ).toThrow(
        `Duplicate Layer identity "${duplicateLayerId}" in slot "${duplicateLayerOwnerId}".`,
      );

      const malformedId = f.nextId();
      const malformedDocument = schema.nodeFromJSON({
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { id: f.nextId() },
            content: [
              {
                type: "surface",
                attrs: { id: f.nextId(), variant: "slide-content" },
                content: [
                  {
                    type: "region",
                    attrs: { id: malformedId },
                    content: [{ type: "paragraph", attrs: { id: f.nextId() } }],
                  },
                ],
              },
            ],
          },
        ],
      });
      expect(() =>
        resolveLayerOwnerSlot({
          doc: malformedDocument,
          ownerId: malformedId,
          layoutDefinitions: mode.composition.capabilities.layouts.registry,
        }),
      ).toThrow('contains unexpected child "paragraph"');
    });
  });
}

function candidateExtensions(
  base: Extensions,
  expressionOverrides: Readonly<Record<string, string>> = {},
  extraNodes: readonly Node[] = [],
): Extensions {
  const expressions = { ...CANDIDATE_CONTENT_EXPRESSIONS, ...expressionOverrides };
  return [
    ...base.map((extension) => {
      const content = expressions[extension.name];
      if (!content) return extension;
      if (!(extension instanceof Node)) {
        throw new Error(`Candidate structural extension "${extension.name}" is not a Node.`);
      }
      return extension.extend({ content });
    }),
    LayerNode,
    ...extraNodes,
  ];
}

function fixture(schema: Schema) {
  let serial = 0;
  const nextId = (): EmbeddedNodeId =>
    EmbeddedNodeIdSchema.parse(`node${String(++serial).padStart(8, "0")}`);
  const node = (
    name: string,
    children: readonly ProseMirrorNode[] = [],
    attrs: Record<string, unknown> = {},
  ): ProseMirrorNode => {
    const type = schema.nodes[name];
    if (!type) throw new Error(`Missing candidate node type "${name}".`);
    return type.createChecked({ id: nextId(), ...attrs }, Fragment.fromArray([...children]));
  };
  const paragraph = () => node("paragraph");
  const layerWithId = (id: EmbeddedNodeId, ...children: ProseMirrorNode[]) =>
    node(LAYER_NODE_TYPE, children, { id });
  const layer = (...children: ProseMirrorNode[]) => layerWithId(nextId(), ...children);
  const section = (layers: readonly ProseMirrorNode[], attrs: Record<string, unknown> = {}) =>
    node("section", layers, attrs);
  const layout = (variant: string, sections: readonly ProseMirrorNode[]) =>
    node("layout", sections, { variant });
  const grid = (cells: readonly ProseMirrorNode[]) => node("grid", cells);
  const accordionSection = (
    layers: readonly ProseMirrorNode[],
    ids: { readonly sectionId?: EmbeddedNodeId; readonly panelId?: EmbeddedNodeId } = {},
  ) =>
    node(
      "section",
      [
        node("accordion_section_title", [paragraph()]),
        node("accordion_section_panel", layers, { id: ids.panelId ?? nextId() }),
      ],
      { id: ids.sectionId ?? nextId() },
    );
  const document = (
    regions: readonly ProseMirrorNode[],
    ids: { readonly surfaceId?: EmbeddedNodeId } = {},
  ) =>
    node("doc", [
      node("courseDocument", [
        node("surface", regions, {
          id: ids.surfaceId ?? nextId(),
          variant: "slide-content",
        }),
      ]),
    ]);

  return {
    accordionSection,
    document,
    grid,
    layer,
    layerWithId,
    layout,
    nextId,
    node,
    paragraph,
    section,
  };
}

function validateContext(
  document: ProseMirrorNode,
  blockDefinitions: Parameters<typeof validateLayerContext>[0]["blockDefinitions"],
  layoutDefinitions: Parameters<typeof validateLayerContext>[0]["layoutDefinitions"],
) {
  return validateLayerContext({ document, blockDefinitions, layoutDefinitions });
}

function requireNode(node: ProseMirrorNode | null | undefined, label: string): ProseMirrorNode {
  if (!node) throw new Error(`Expected ${label} node.`);
  return node;
}

function embeddedId(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
