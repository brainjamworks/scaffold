import type { EmbeddedNodeId } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type {
  DocumentTreeBlockDefinition,
  DocumentTreeDefinitionLookup,
  DocumentTreeLayoutDefinition,
  DocumentTreeSurfaceDefinition,
} from "@/document/model/document-tree/definition-lookup";
import type {
  DocumentTreeSnapshot,
  DocumentTreeItem,
} from "@/document/model/document-tree/document-tree-snapshot";
import { normalizeControlDefinition, type ControlDefinition } from "./control-definition";
import { createControlCapabilityCatalogue } from "./control-capability-catalogue";

const IDS = {
  surfaceAlpha: id("surfaceAlpha1"),
  surfaceBeta: id("surfaceBeta01"),
  region: id("regionAlpha01"),
  layoutAlpha: id("layoutAlpha01"),
  layoutBeta: id("layoutBeta001"),
  sectionAlpha: id("sectionAlpha1"),
  sectionBeta: id("sectionBeta01"),
  block: id("blockControl1"),
  blockItem: id("blockItem0001"),
  passiveBlock: id("blockPassive1"),
  passiveItem: id("privatePublic1"),
  missing: id("missingTarget1"),
} as const;

const SURFACE_ALPHA_CONTROL = control({
  owner: { events: [{ type: "entered-alpha", label: "Entered alpha" }] },
  semanticChildren: {
    region: {
      states: [{ key: "visible", label: "Visible", valueType: { kind: "boolean" } }],
    },
    section: { commands: [{ type: "outer-select", label: "Outer select" }] },
    controlled_block: {
      commands: [{ type: "outer-block-command", label: "Outer block command" }],
    },
    block_item: { events: [{ type: "outer-item-event", label: "Outer item event" }] },
  },
});

const SURFACE_BETA_CONTROL = control({
  owner: { commands: [{ type: "open-beta", label: "Open beta" }] },
});

const LAYOUT_ALPHA_CONTROL = control({
  owner: {
    states: [
      {
        key: "variant",
        label: "Variant",
        valueType: {
          kind: "enum",
          options: [
            { value: "alpha", label: "Alpha" },
            { value: "beta", label: "Beta" },
          ],
        },
      },
    ],
  },
  semanticChildren: {
    section: { commands: [{ type: "select-alpha", label: "Select alpha" }] },
  },
});

const LAYOUT_BETA_CONTROL = control({
  owner: { events: [{ type: "changed-beta", label: "Changed beta" }] },
  semanticChildren: {
    section: { commands: [{ type: "select-beta", label: "Select beta" }] },
  },
});

const BLOCK_CONTROL = control({
  owner: { commands: [{ type: "submit", label: "Submit" }] },
  semanticChildren: {
    block_item: { events: [{ type: "changed", label: "Changed" }] },
  },
});

describe("createControlCapabilityCatalogue", () => {
  it.each([
    {
      name: "an event-only Surface owner root",
      targetId: IDS.surfaceAlpha,
      ownerId: IDS.surfaceAlpha,
      capabilities: SURFACE_ALPHA_CONTROL.owner!,
    },
    {
      name: "a state-only Surface semantic child",
      targetId: IDS.region,
      ownerId: IDS.surfaceAlpha,
      capabilities: SURFACE_ALPHA_CONTROL.semanticChildren!["region"]!,
    },
    {
      name: "a command-only Surface owner root",
      targetId: IDS.surfaceBeta,
      ownerId: IDS.surfaceBeta,
      capabilities: SURFACE_BETA_CONTROL.owner!,
    },
    {
      name: "a command-only Block owner root",
      targetId: IDS.block,
      ownerId: IDS.block,
      capabilities: BLOCK_CONTROL.owner!,
    },
    {
      name: "an event-only Block semantic child",
      targetId: IDS.blockItem,
      ownerId: IDS.block,
      capabilities: BLOCK_CONTROL.semanticChildren!["block_item"]!,
    },
  ])("resolves $name through its exact semantic owner", ({ targetId, ownerId, capabilities }) => {
    const fixture = createFixture(1);
    const catalogue = createControlCapabilityCatalogue({
      snapshot: fixture.snapshot,
      definitions: fixture.definitions,
    });

    expectResolved(catalogue.resolve(targetId), { targetId, ownerId, capabilities });
  });

  it("keeps a passive Block and its published child outside the capability map", () => {
    const fixture = createFixture(1);
    const catalogue = createControlCapabilityCatalogue({
      snapshot: fixture.snapshot,
      definitions: fixture.definitions,
    });

    for (const targetId of [IDS.passiveBlock, IDS.passiveItem]) {
      const result = catalogue.resolve(targetId);
      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error(`Expected passive target "${targetId}" to be omitted.`);
      expect(result.error).toEqual({ reason: "no-declared-capabilities", targetId });
    }
  });

  it("uses exact Layout and Surface variants when node types are shared", () => {
    const fixture = createFixture(2);
    const catalogue = createControlCapabilityCatalogue({
      snapshot: fixture.snapshot,
      definitions: fixture.definitions,
    });

    expectResolved(catalogue.resolve(IDS.surfaceBeta), {
      targetId: IDS.surfaceBeta,
      ownerId: IDS.surfaceBeta,
      capabilities: SURFACE_BETA_CONTROL.owner!,
    });
    expectResolved(catalogue.resolve(IDS.layoutBeta), {
      targetId: IDS.layoutBeta,
      ownerId: IDS.layoutBeta,
      capabilities: LAYOUT_BETA_CONTROL.owner!,
    });
    expectResolved(catalogue.resolve(IDS.sectionBeta), {
      targetId: IDS.sectionBeta,
      ownerId: IDS.layoutBeta,
      capabilities: LAYOUT_BETA_CONTROL.semanticChildren!["section"]!,
    });
  });

  it("stops outer traversal at nested semantic owners", () => {
    const fixture = createFixture(3);
    const catalogue = createControlCapabilityCatalogue({
      snapshot: fixture.snapshot,
      definitions: fixture.definitions,
    });

    expectResolved(catalogue.resolve(IDS.sectionAlpha), {
      targetId: IDS.sectionAlpha,
      ownerId: IDS.layoutAlpha,
      capabilities: LAYOUT_ALPHA_CONTROL.semanticChildren!["section"]!,
    });
    expectResolved(catalogue.resolve(IDS.blockItem), {
      targetId: IDS.blockItem,
      ownerId: IDS.block,
      capabilities: BLOCK_CONTROL.semanticChildren!["block_item"]!,
    });

    const passiveChild = catalogue.resolve(IDS.passiveItem);
    expect(passiveChild.isErr()).toBe(true);
    if (passiveChild.isErr()) {
      expect(passiveChild.error).toEqual({
        reason: "no-declared-capabilities",
        targetId: IDS.passiveItem,
      });
    }
  });

  it.each([
    {
      name: "target-not-public from target resolution",
      resolve: (catalogue: ReturnType<typeof createControlCapabilityCatalogue>) =>
        catalogue.resolve(IDS.missing),
      expected: { reason: "target-not-public", targetId: IDS.missing },
    },
    {
      name: "no-declared-capabilities from target resolution",
      resolve: (catalogue: ReturnType<typeof createControlCapabilityCatalogue>) =>
        catalogue.resolve(IDS.passiveBlock),
      expected: { reason: "no-declared-capabilities", targetId: IDS.passiveBlock },
    },
    {
      name: "command-not-declared from command resolution",
      resolve: (catalogue: ReturnType<typeof createControlCapabilityCatalogue>) =>
        catalogue.resolveCommand(IDS.region, "hide"),
      expected: { reason: "command-not-declared", targetId: IDS.region, type: "hide" },
    },
    {
      name: "target-not-public from command resolution",
      resolve: (catalogue: ReturnType<typeof createControlCapabilityCatalogue>) =>
        catalogue.resolveCommand(IDS.missing, "select"),
      expected: { reason: "target-not-public", targetId: IDS.missing },
    },
    {
      name: "no-declared-capabilities from command resolution",
      resolve: (catalogue: ReturnType<typeof createControlCapabilityCatalogue>) =>
        catalogue.resolveCommand(IDS.passiveBlock, "select"),
      expected: { reason: "no-declared-capabilities", targetId: IDS.passiveBlock },
    },
  ])("returns $name with all required facts", ({ resolve, expected }) => {
    const fixture = createFixture(4);
    const catalogue = createControlCapabilityCatalogue({
      snapshot: fixture.snapshot,
      definitions: fixture.definitions,
    });
    const result = resolve(catalogue);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error(`Expected ${expected.reason}.`);
    expect(result.error).toEqual(expected);
    expect(Object.isFrozen(result.error)).toBe(true);
  });

  it("resolves an exact command without duplicating definition identity", () => {
    const fixture = createFixture(5);
    const catalogue = createControlCapabilityCatalogue({
      snapshot: fixture.snapshot,
      definitions: fixture.definitions,
    });
    const result = catalogue.resolveCommand(IDS.sectionAlpha, "select-alpha");

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual({
      targetId: IDS.sectionAlpha,
      ownerId: IDS.layoutAlpha,
      command: LAYOUT_ALPHA_CONTROL.semanticChildren!["section"]!.commands![0],
    });
    expect(result.value.command).toBe(
      LAYOUT_ALPHA_CONTROL.semanticChildren!["section"]!.commands![0],
    );
    expect(result.value).not.toHaveProperty("definitionId");
    expect(result.value).not.toHaveProperty("nodeType");
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("provides separate strict owner-definition and owned-target capability seams", () => {
    const fixture = createFixture(6);
    const catalogue = createControlCapabilityCatalogue({
      snapshot: fixture.snapshot,
      definitions: fixture.definitions,
    });

    expect(catalogue.requireOwnerControlDefinition(IDS.layoutAlpha)).toBe(LAYOUT_ALPHA_CONTROL);
    expect(catalogue.requireOwnedTargetCapabilities(IDS.layoutAlpha, IDS.sectionAlpha)).toBe(
      LAYOUT_ALPHA_CONTROL.semanticChildren!["section"],
    );
    expect(() =>
      catalogue.requireOwnedTargetCapabilities(IDS.layoutBeta, IDS.sectionAlpha),
    ).toThrow(`Control target "${IDS.sectionAlpha}" does not belong to owner "${IDS.layoutBeta}".`);
    expect(() => catalogue.requireOwnerControlDefinition(IDS.sectionAlpha)).toThrow(
      `Control owner "${IDS.sectionAlpha}" is not a current semantic owner.`,
    );
    expect(() => catalogue.requireOwnerControlDefinition(IDS.passiveBlock)).toThrow(
      `Control owner "${IDS.passiveBlock}" has no Control Definition.`,
    );
    expect(() => catalogue.requireOwnerControlDefinition(IDS.missing)).toThrow(
      `Control owner "${IDS.missing}" is not public.`,
    );
  });

  it("creates a distinct immutable target map for each snapshot revision", () => {
    const definitions = createDefinitions();
    const firstSnapshot = snapshot(7, [
      item(IDS.layoutAlpha, "layout", "layout", "layout-alpha", [
        item(IDS.sectionAlpha, "layout-section", "section", "layout-alpha"),
      ]),
    ]);
    const secondSnapshot = snapshot(8, [
      item(IDS.layoutAlpha, "layout", "layout", "layout-beta", [
        item(IDS.sectionAlpha, "layout-section", "section", "layout-beta"),
      ]),
    ]);

    const first = createControlCapabilityCatalogue({ snapshot: firstSnapshot, definitions });
    const second = createControlCapabilityCatalogue({ snapshot: secondSnapshot, definitions });
    const firstTarget = first.resolve(IDS.sectionAlpha);
    const secondTarget = second.resolve(IDS.sectionAlpha);

    expect(firstTarget.isOk()).toBe(true);
    expect(secondTarget.isOk()).toBe(true);
    if (firstTarget.isErr() || secondTarget.isErr()) return;
    expect(firstTarget.value.capabilities).toBe(LAYOUT_ALPHA_CONTROL.semanticChildren!["section"]);
    expect(secondTarget.value.capabilities).toBe(LAYOUT_BETA_CONTROL.semanticChildren!["section"]);
    expect(firstTarget.value).not.toBe(secondTarget.value);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);
  });

  it("throws when contradictory owners claim the same public target", () => {
    const shared = item(IDS.blockItem, "exposed-child", "block_item", "surface-alpha");
    const first = item(IDS.surfaceAlpha, "surface", "surface", "surface-alpha", [shared]);
    const second = item(IDS.surfaceBeta, "surface", "surface", "surface-duplicate", [shared]);

    expect(() =>
      createControlCapabilityCatalogue({
        snapshot: snapshot(9, [first, second]),
        definitions: createDefinitions(),
      }),
    ).toThrow(
      `Control target "${IDS.blockItem}" is claimed by both "${IDS.surfaceAlpha}" and "${IDS.surfaceBeta}".`,
    );
  });

  it("throws when a published owner references a missing exact definition", () => {
    const owner = item(IDS.layoutAlpha, "layout", "layout", "missing-layout");

    expect(() =>
      createControlCapabilityCatalogue({
        snapshot: snapshot(10, [owner]),
        definitions: createDefinitions(),
      }),
    ).toThrow(
      'Semantic owner "layoutAlpha01" references missing Layout definition "missing-layout".',
    );
  });
});

function createFixture(revision: number): {
  readonly snapshot: DocumentTreeSnapshot;
  readonly definitions: DocumentTreeDefinitionLookup;
} {
  const passiveItem = item(IDS.passiveItem, "exposed-child", "block_item", "passive_block");
  const passiveBlock = item(IDS.passiveBlock, "block", "passive_block", "passive_block", [
    passiveItem,
  ]);
  const block = item(IDS.block, "block", "controlled_block", "controlled_block", [
    item(IDS.blockItem, "exposed-child", "block_item", "controlled_block"),
  ]);
  const layoutAlpha = item(IDS.layoutAlpha, "layout", "layout", "layout-alpha", [
    item(IDS.sectionAlpha, "layout-section", "section", "layout-alpha"),
  ]);
  const layoutBeta = item(IDS.layoutBeta, "layout", "layout", "layout-beta", [
    item(IDS.sectionBeta, "layout-section", "section", "layout-beta"),
  ]);
  const region = item(IDS.region, "region", "region", null, [block, passiveBlock]);
  const surfaceAlpha = item(IDS.surfaceAlpha, "surface", "surface", "surface-alpha", [
    region,
    layoutAlpha,
  ]);
  const surfaceBeta = item(IDS.surfaceBeta, "surface", "surface", "surface-beta", [layoutBeta]);

  return {
    snapshot: snapshot(revision, [surfaceAlpha, surfaceBeta]),
    definitions: createDefinitions(),
  };
}

function createDefinitions(): DocumentTreeDefinitionLookup {
  const blocks = new Map<string, DocumentTreeBlockDefinition>([
    [
      "controlled_block",
      Object.freeze({
        nodeType: "controlled_block",
        title: "Controlled block",
        isAssessment: false,
        control: BLOCK_CONTROL,
      }),
    ],
    [
      "passive_block",
      Object.freeze({
        nodeType: "passive_block",
        title: "Passive block",
        isAssessment: false,
      }),
    ],
  ]);
  const layouts = new Map<string, DocumentTreeLayoutDefinition>([
    [
      "layout-alpha",
      Object.freeze({ id: "layout-alpha", title: "Layout alpha", control: LAYOUT_ALPHA_CONTROL }),
    ],
    [
      "layout-beta",
      Object.freeze({ id: "layout-beta", title: "Layout beta", control: LAYOUT_BETA_CONTROL }),
    ],
  ]);
  const surfaces = new Map<string, DocumentTreeSurfaceDefinition>([
    [
      "surface-alpha",
      Object.freeze({
        id: "surface-alpha",
        title: "Surface alpha",
        control: SURFACE_ALPHA_CONTROL,
      }),
    ],
    [
      "surface-beta",
      Object.freeze({ id: "surface-beta", title: "Surface beta", control: SURFACE_BETA_CONTROL }),
    ],
    [
      "surface-duplicate",
      Object.freeze({
        id: "surface-duplicate",
        title: "Surface duplicate",
        control: control({
          semanticChildren: {
            block_item: { events: [{ type: "duplicate", label: "Duplicate" }] },
          },
        }),
      }),
    ],
  ]);

  return Object.freeze({
    blocks: Object.freeze({ get: (nodeType: string) => blocks.get(nodeType) }),
    layouts: Object.freeze({ get: (variant: string) => layouts.get(variant) }),
    surfaces: Object.freeze({ get: (variant: string) => surfaces.get(variant) }),
  });
}

function item(
  itemId: EmbeddedNodeId,
  kind: DocumentTreeItem["kind"],
  nodeType: string,
  definitionId: string | null,
  children: readonly DocumentTreeItem[] = [],
): DocumentTreeItem {
  return Object.freeze({
    id: itemId,
    kind,
    nodeType,
    definitionId,
    label: nodeType,
    summary: null,
    presentation: Object.freeze({ actionIds: Object.freeze([]), disabledReason: null }),
    children: Object.freeze([...children]),
  });
}

function snapshot(revision: number, roots: readonly DocumentTreeItem[]): DocumentTreeSnapshot {
  const itemById = new Map<EmbeddedNodeId, DocumentTreeItem>();
  const parentById = new Map<EmbeddedNodeId, EmbeddedNodeId | null>();
  const visit = (semanticItem: DocumentTreeItem, parentId: EmbeddedNodeId | null) => {
    if (itemById.has(semanticItem.id)) return;
    itemById.set(semanticItem.id, semanticItem);
    parentById.set(semanticItem.id, parentId);
    for (const child of semanticItem.children) visit(child, semanticItem.id);
  };
  for (const root of roots) visit(root, null);

  return Object.freeze({
    revision,
    mode: "page",
    roots: Object.freeze([...roots]),
    itemById,
    parentById,
    locationById: new Map(),
    diagnostics: Object.freeze([]),
  });
}

function control(definition: ControlDefinition): ControlDefinition {
  const normalized = normalizeControlDefinition(definition);
  if (!normalized) throw new Error("Expected a Control Definition fixture.");
  return normalized;
}

function id(value: string): EmbeddedNodeId {
  return value as EmbeddedNodeId;
}

function expectResolved(
  result: ReturnType<ReturnType<typeof createControlCapabilityCatalogue>["resolve"]>,
  expected: {
    readonly targetId: EmbeddedNodeId;
    readonly ownerId: EmbeddedNodeId;
    readonly capabilities: unknown;
  },
): void {
  expect(result.isOk()).toBe(true);
  if (result.isErr()) return;
  expect(result.value).toEqual(expected);
  expect(result.value.capabilities).toBe(expected.capabilities);
  expect(Object.isFrozen(result.value)).toBe(true);
}
