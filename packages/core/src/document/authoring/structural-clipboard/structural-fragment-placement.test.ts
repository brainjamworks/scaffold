import { CircleIcon } from "@phosphor-icons/react";
import { PresentationContentLayout } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vite-plus/test";

import { createLayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { CONTENT_LAYOUT_ATTR } from "@/editor/content-layout/model/content-layout-attribute";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";

import type {
  StructuralFragmentContent,
  StructuralFragmentRootKind,
  StructuralFragmentV1Envelope,
} from "./structural-fragment-codec";
import { resolveStructuralFragmentPlacement } from "./structural-fragment-placement";
import {
  validateStructuralFragment,
  type StructuralFragmentCapabilityRegistries,
  type ValidatedStructuralFragment,
} from "./structural-fragment-validation";

const IDS = {
  course: "course000001",
  surfaceA: "surface00001",
  surfaceB: "surface00002",
  blockA: "block0000001",
  blockB: "block0000002",
  paragraph: "para00000001",
  region: "region000001",
  layout: "layout000001",
  section: "section00001",
  container: "contain000001",
  privateHost: "private000001",
  privateShell: "shell0000001",
} as const;

const schema = createSchema();
const capabilities = createCapabilities();

describe("structural fragment placement", () => {
  it.each(["block", "layout"] as const)(
    "places a validated %s immediately after one exact selected structural root",
    (rootKind) => {
      const doc = courseDoc("slideshow", [surface("slide-open", [coreBlock(IDS.blockA)])]);
      const destinationPos = findPosById(doc, IDS.blockA);
      const selection = NodeSelection.create(doc, destinationPos);
      const source = rootKind === "block" ? coreBlock(IDS.blockB) : layout();

      expect(
        resolveStructuralFragmentPlacement({
          fragment: validated(rootKind, source),
          doc,
          destination: { kind: "selection", selection },
          capabilities,
        }),
      ).toEqual({
        status: "ok",
        placement: {
          kind: "range",
          range: { from: selection.to, to: selection.to },
        },
      });
    },
  );

  it("accepts a mounted Layout as the selected structural destination", () => {
    const doc = courseDoc("slideshow", [surface("slide-open", [layout()])]);
    const selection = NodeSelection.create(doc, findPosById(doc, IDS.layout));

    expect(
      resolveStructuralFragmentPlacement({
        fragment: validated("block", coreBlock(IDS.blockB)),
        doc,
        destination: { kind: "selection", selection },
        capabilities,
      }),
    ).toMatchObject({ status: "ok", placement: { kind: "range" } });
  });

  it.each(["block", "layout"] as const)(
    "replaces one direct empty structural textblock with a validated %s",
    (rootKind) => {
      const doc = courseDoc("slideshow", [
        surface("slide-open", [
          coreBlock(IDS.blockA),
          { type: "paragraph", attrs: { id: IDS.paragraph } },
        ]),
      ]);
      const selection = TextSelection.create(doc, findPosById(doc, IDS.paragraph) + 1);
      const source = rootKind === "block" ? coreBlock(IDS.blockB) : layout();

      expect(
        resolveStructuralFragmentPlacement({
          fragment: validated(rootKind, source),
          doc,
          destination: { kind: "text-caret", selection },
          capabilities,
        }),
      ).toEqual({
        status: "ok",
        placement: {
          kind: "range",
          range: {
            from: findPosById(doc, IDS.paragraph),
            to: findPosById(doc, IDS.paragraph) + 2,
          },
        },
      });
    },
  );

  it("places a validated Block after the direct rich-text root containing an empty caret", () => {
    const doc = courseDoc("slideshow", [
      surface("slide-open", [
        coreBlock(IDS.blockA),
        {
          type: "bullet_list",
          attrs: { id: "list00000001" },
          content: [
            {
              type: "list_item",
              attrs: { id: "item00000001" },
              content: [{ type: "paragraph", attrs: { id: IDS.paragraph } }],
            },
          ],
        },
      ]),
    ]);
    const paragraphPos = findPosById(doc, IDS.paragraph);
    const listPos = findPosById(doc, "list00000001");
    const list = doc.nodeAt(listPos);
    if (!list) throw new Error("Missing list fixture");
    const selection = TextSelection.create(doc, paragraphPos + 1);

    expect(
      resolveStructuralFragmentPlacement({
        fragment: validated("block", coreBlock(IDS.blockB)),
        doc,
        destination: { kind: "text-caret", selection },
        capabilities,
      }),
    ).toEqual({
      status: "ok",
      placement: {
        kind: "range",
        range: { from: listPos + list.nodeSize, to: listPos + list.nodeSize },
      },
    });
  });

  it("uses the nearest mounted-schema container instead of a named container allowlist", () => {
    const doc = courseDoc("slideshow", [
      surface("slide-open", [
        {
          type: "private_shell",
          attrs: { id: IDS.privateShell },
          content: [
            {
              type: "private_host",
              attrs: { id: IDS.privateHost },
              content: [{ type: "paragraph", attrs: { id: IDS.paragraph } }],
            },
          ],
        },
      ]),
    ]);
    const paragraphPos = findPosById(doc, IDS.paragraph);
    const selection = TextSelection.create(doc, paragraphPos + 1);

    expect(
      resolveStructuralFragmentPlacement({
        fragment: validated("block", coreBlock(IDS.blockB)),
        doc,
        destination: { kind: "text-caret", selection },
        capabilities,
      }),
    ).toEqual({
      status: "ok",
      placement: {
        kind: "range",
        range: { from: paragraphPos, to: paragraphPos + 2 },
      },
    });
  });

  it("places a validated Block after the non-empty paragraph containing the caret", () => {
    const doc = courseDoc("slideshow", [
      surface("slide-open", [
        coreBlock(IDS.blockA),
        {
          type: "paragraph",
          attrs: { id: IDS.paragraph },
          content: [{ type: "text", text: "Authored text" }],
        },
      ]),
    ]);
    const selection = TextSelection.create(doc, findPosById(doc, IDS.paragraph) + 1);

    const paragraphPos = findPosById(doc, IDS.paragraph);
    const paragraph = doc.nodeAt(paragraphPos);
    if (!paragraph) throw new Error("Missing paragraph fixture");

    expect(
      resolveStructuralFragmentPlacement({
        fragment: validated("block", coreBlock(IDS.blockB)),
        doc,
        destination: { kind: "text-caret", selection },
        capabilities,
      }),
    ).toEqual({
      status: "ok",
      placement: {
        kind: "range",
        range: {
          from: paragraphPos + paragraph.nodeSize,
          to: paragraphPos + paragraph.nodeSize,
        },
      },
    });
  });

  it("refuses non-node, stale and unmounted structural selections", () => {
    const selectedBlock = coreBlock(IDS.blockA, [
      { type: "paragraph", attrs: { id: IDS.paragraph }, content: [{ type: "text", text: "x" }] },
    ]);
    const doc = courseDoc("slideshow", [surface("slide-open", [selectedBlock])]);
    const paragraphPos = findPosById(doc, IDS.paragraph);
    const otherDoc = courseDoc("slideshow", [surface("slide-open", [coreBlock(IDS.blockA)])]);
    const unmountedDoc = courseDoc("slideshow", [surface("slide-open", [unknownBlock()])]);

    expect(placeBlock(doc, TextSelection.create(doc, paragraphPos + 1))).toEqual({
      status: "refused",
      reason: "invalid_destination_selection",
    });
    expect(
      placeBlock(doc, NodeSelection.create(otherDoc, findPosById(otherDoc, IDS.blockA))),
    ).toEqual({ status: "refused", reason: "stale_destination_selection" });
    expect(
      placeBlock(
        unmountedDoc,
        NodeSelection.create(unmountedDoc, findPosById(unmountedDoc, IDS.blockA)),
      ),
    ).toEqual({ status: "refused", reason: "unavailable_destination" });
  });

  it("reuses the mounted Surface-root insertion policy", () => {
    const doc = courseDoc("slideshow", [surface("slide-closed", [coreBlock(IDS.blockA)])]);
    const selection = NodeSelection.create(doc, findPosById(doc, IDS.blockA));

    expect(placeBlock(doc, selection)).toEqual({
      status: "refused",
      reason: "surface_root_insertion_refused",
    });
  });

  it("reuses bounded-container occupancy policy for an adjacent insertion", () => {
    const doc = courseDoc("slideshow", [
      surface("slide-open", [
        {
          type: "region",
          attrs: { id: IDS.region },
          content: [{ type: "fill_block", attrs: { id: IDS.blockA } }],
        },
      ]),
    ]);
    const selection = NodeSelection.create(doc, findPosById(doc, IDS.blockA));

    expect(placeBlock(doc, selection)).toEqual({
      status: "refused",
      reason: "bounded_container_insertion_refused",
    });
  });

  it("allows adjacent placement beside an occupied Sequence Region", () => {
    const doc = courseDoc("slideshow", [
      surface("slide-open", [
        {
          type: "region",
          attrs: {
            id: IDS.region,
            [CONTENT_LAYOUT_ATTR]: PresentationContentLayout.Sequence,
          },
          content: [{ type: "fill_block", attrs: { id: IDS.blockA } }],
        },
      ]),
    ]);
    const selection = NodeSelection.create(doc, findPosById(doc, IDS.blockA));
    const fragment = validated("block", {
      type: "fill_block",
      attrs: { id: IDS.blockB },
    });
    const beforeDocument = doc.toJSON();

    expect(
      resolveStructuralFragmentPlacement({
        fragment,
        doc,
        destination: { kind: "selection", selection },
        capabilities,
      }),
    ).toEqual({
      status: "ok",
      placement: {
        kind: "range",
        range: { from: selection.to, to: selection.to },
      },
    });
    expect(doc.toJSON()).toEqual(beforeDocument);
  });

  it("throws when an eligible bounded Region has an invalid contentLayout", () => {
    const doc = courseDoc("slideshow", [
      surface("slide-open", [
        {
          type: "region",
          attrs: { id: IDS.region, [CONTENT_LAYOUT_ATTR]: "unsupported" },
          content: [{ type: "fill_block", attrs: { id: IDS.blockA } }],
        },
      ]),
    ]);
    const selection = NodeSelection.create(doc, findPosById(doc, IDS.blockA));

    expect(() => placeBlock(doc, selection)).toThrow();
  });

  it("checks the actual source node type against the adjacent parent schema", () => {
    const doc = courseDoc("slideshow", [
      surface("slide-open", [
        {
          type: "strict_container",
          attrs: { id: IDS.container },
          content: [coreBlock(IDS.blockA)],
        },
      ]),
    ]);
    const selection = NodeSelection.create(doc, findPosById(doc, IDS.blockA));

    expect(
      resolveStructuralFragmentPlacement({
        fragment: validated("layout", layout()),
        doc,
        destination: { kind: "selection", selection },
        capabilities,
      }),
    ).toEqual({ status: "refused", reason: "schema_insertion_refused" });
  });

  it("places a compatible slideshow Surface after the mounted destination Surface", () => {
    const doc = courseDoc("slideshow", [
      surface("slide-open", [coreBlock(IDS.blockA)], IDS.surfaceA),
      surface("slide-open", [coreBlock(IDS.blockB)], IDS.surfaceB),
    ]);

    expect(
      resolveStructuralFragmentPlacement({
        fragment: validated(
          "surface",
          surface("slide-open", [coreBlock("source000001")], "sourceSurf01"),
        ),
        doc,
        destination: { kind: "surface", afterSurfaceId: IDS.surfaceA },
        capabilities,
      }),
    ).toEqual({
      status: "ok",
      placement: {
        kind: "surface",
        destination: { afterSurfaceId: IDS.surfaceA },
      },
    });
  });

  it("refuses Surface placement outside compatible slideshow-to-slideshow flow", () => {
    const slideshow = courseDoc("slideshow", [
      surface("slide-open", [coreBlock(IDS.blockA)], IDS.surfaceA),
    ]);
    const page = courseDoc("page", [surface("page-only", [coreBlock(IDS.blockA)], IDS.surfaceA)]);

    expect(placeSurface(page, "slide-open", IDS.surfaceA)).toEqual({
      status: "refused",
      reason: "incompatible_surface_mode",
    });
    expect(placeSurface(slideshow, "page-only", IDS.surfaceA)).toEqual({
      status: "refused",
      reason: "incompatible_surface_variant",
    });
    expect(placeSurface(slideshow, "slide-open", "missing00001")).toEqual({
      status: "refused",
      reason: "invalid_surface_destination",
    });

    const unmountedDestination = courseDoc("slideshow", [
      surface("missing-slide", [coreBlock(IDS.blockA)], IDS.surfaceA),
    ]);
    expect(placeSurface(unmountedDestination, "slide-open", IDS.surfaceA)).toEqual({
      status: "refused",
      reason: "unavailable_destination",
    });
  });

  it("requires the destination context appropriate to the validated root kind", () => {
    const doc = courseDoc("slideshow", [surface("slide-open", [coreBlock(IDS.blockA)])]);
    const selection = NodeSelection.create(doc, findPosById(doc, IDS.blockA));

    expect(
      resolveStructuralFragmentPlacement({
        fragment: validated("block", coreBlock(IDS.blockB)),
        doc,
        destination: { kind: "surface", afterSurfaceId: IDS.surfaceA },
        capabilities,
      }),
    ).toEqual({ status: "refused", reason: "destination_kind_mismatch" });
    expect(
      resolveStructuralFragmentPlacement({
        fragment: validated("surface", surface("slide-open")),
        doc,
        destination: { kind: "selection", selection },
        capabilities,
      }),
    ).toEqual({ status: "refused", reason: "destination_kind_mismatch" });
  });
});

function placeBlock(doc: ProseMirrorNode, selection: NodeSelection | TextSelection) {
  return resolveStructuralFragmentPlacement({
    fragment: validated("block", coreBlock(IDS.blockB)),
    doc,
    destination: { kind: "selection", selection },
    capabilities,
  });
}

function placeSurface(doc: ProseMirrorNode, sourceVariant: string, afterSurfaceId: string) {
  return resolveStructuralFragmentPlacement({
    fragment: validated(
      "surface",
      surface(sourceVariant, [coreBlock("source000001")], "sourceSurf01"),
    ),
    doc,
    destination: { kind: "surface", afterSurfaceId },
    capabilities,
  });
}

function validated(
  rootKind: StructuralFragmentRootKind,
  content: StructuralFragmentContent,
): ValidatedStructuralFragment {
  const result = validateStructuralFragment({
    fragment: envelope(rootKind, content),
    schema,
    capabilities,
  });
  if (result.status !== "ok") {
    throw new Error(`Fixture refused: ${result.reason}`);
  }
  return result.value;
}

function envelope(
  rootKind: StructuralFragmentRootKind,
  content: StructuralFragmentContent,
): StructuralFragmentV1Envelope {
  return {
    protocol: "scaffold.structural-fragment",
    version: 1,
    documentFormatVersion: 4,
    rootKind,
    content,
  };
}

function createCapabilities(): StructuralFragmentCapabilityRegistries {
  return {
    blocks: createBlockRegistry([
      defineBlock({ nodeType: "core_block", title: "Core block" }),
      defineBlock({ nodeType: "fill_block", title: "Fill block", boundedPlacement: "fill" }),
      defineBlock({ nodeType: "strict_container", title: "Strict container" }),
    ]),
    layouts: createLayoutRegistry([
      {
        id: "basic-layout",
        title: "Basic layout",
        description: "Basic layout",
        icon: CircleIcon,
        createContent: () => ({ type: "layout", attrs: { variant: "basic-layout" } }),
      },
    ]),
    surfaces: createSurfaceVariantRegistry([
      {
        id: "slide-open",
        modes: ["slideshow"],
        defaultForModes: ["slideshow"],
        title: "Open slide",
        description: "Open slide",
        createSurface: ({ surfaceId }) => surface("slide-open", [coreBlock(IDS.blockA)], surfaceId),
      },
      {
        id: "slide-closed",
        modes: ["slideshow"],
        title: "Closed slide",
        description: "Closed slide",
        structurePolicy: { allowRootInsertion: false },
        createSurface: ({ surfaceId }) =>
          surface("slide-closed", [coreBlock(IDS.blockA)], surfaceId),
      },
      {
        id: "page-only",
        modes: ["page"],
        defaultForModes: ["page"],
        title: "Page",
        description: "Page",
        createSurface: ({ surfaceId }) => surface("page-only", [coreBlock(IDS.blockA)], surfaceId),
      },
    ]),
  };
}

function createSchema(): Schema {
  const id = { default: null };
  return new Schema({
    nodes: {
      doc: { content: "courseDocument" },
      courseDocument: {
        attrs: { id, mode: { default: "slideshow" } },
        content: "surface+",
      },
      surface: {
        attrs: { id, variant: { default: null }, settings: { default: {} } },
        content: "(block | arrangement)+",
      },
      region: {
        group: "arrangement",
        attrs: { id, [CONTENT_LAYOUT_ATTR]: { default: PresentationContentLayout.Flow } },
        content: "block+",
      },
      layout: {
        group: "block arrangement",
        attrs: { id, variant: { default: null }, options: { default: {} } },
        content: "section+",
      },
      section: { attrs: { id, options: { default: {} } }, content: "block+" },
      strict_container: { group: "block", attrs: { id }, content: "core_block+" },
      private_shell: { group: "block", attrs: { id }, content: "private_host" },
      private_host: { attrs: { id }, content: "block+" },
      core_block: { group: "block", attrs: { id }, content: "block*" },
      fill_block: { group: "block", attrs: { id }, atom: true },
      unknown_block: { group: "block", attrs: { id }, atom: true },
      bullet_list: { group: "block", attrs: { id }, content: "list_item+" },
      list_item: { attrs: { id }, content: "paragraph+" },
      paragraph: { group: "block", attrs: { id }, content: "text*" },
      text: {},
    },
  });
}

function courseDoc(mode: "page" | "slideshow", surfaces: readonly StructuralFragmentContent[]) {
  return schema.nodeFromJSON({
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: IDS.course, mode },
        content: surfaces,
      },
    ],
  });
}

function surface(
  variant: string,
  content: readonly StructuralFragmentContent[] = [coreBlock(IDS.blockA)],
  id: string = IDS.surfaceA,
): StructuralFragmentContent {
  return { type: "surface", attrs: { id, variant, settings: {} }, content };
}

function coreBlock(
  id: string,
  content: readonly StructuralFragmentContent[] = [],
): StructuralFragmentContent {
  return { type: "core_block", attrs: { id }, ...(content.length > 0 ? { content } : {}) };
}

function unknownBlock(): StructuralFragmentContent {
  return { type: "unknown_block", attrs: { id: IDS.blockA } };
}

function layout(): StructuralFragmentContent {
  return {
    type: "layout",
    attrs: { id: IDS.layout, variant: "basic-layout", options: {} },
    content: [
      {
        type: "section",
        attrs: { id: IDS.section, options: {} },
        content: [coreBlock(IDS.blockB)],
      },
    ],
  };
}

function findPosById(doc: ProseMirrorNode, id: string): number {
  let found: number | undefined;
  doc.descendants((node, pos) => {
    if (found === undefined && node.attrs["id"] === id) found = pos;
  });
  if (found === undefined) throw new Error(`Missing fixture node ${id}`);
  return found;
}
