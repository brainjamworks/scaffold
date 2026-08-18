import { Editor, Extension, Node, type JSONContent } from "@tiptap/core";
import { EditorContent, type ReactNodeViewProps } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";

import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type BlockCapability,
} from "@/composition/application/create-scaffold-application";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";
import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";
import { defineBlock, type BlockDefinition } from "@/editor/blocks/block-definition";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { projectAuthoringCourseStructure } from "@/document/authoring/course-structure/project-authoring-course-structure";
import { projectSemanticDocument } from "@/document/model/semantic-document";
import { CONTENT_LAYOUT_PROJECTION_DOM_ATTRS } from "../view/content-layout-projection-dom";
import {
  clearContentLayoutProjectionMeta,
  readContentLayoutProjectionDiagnostics,
  setContentLayoutProjectionBatchMeta,
  type ContentLayoutProjectionBatch,
} from "./content-layout-projection-extension";
import "@/styles/globals.css";

const ORDINARY_BLOCK_TYPE = "projection_tracer_ordinary_block";
const RESIZABLE_BLOCK_TYPE = "projection_tracer_resizable_block";

const OWNER_IDS = Object.freeze({
  paragraph: "para00000001",
  ordinaryBlock: "ordinary0001",
  resizableBlock: "resize000001",
  grid: "grid00000001",
  cell: "cell00000001",
  cellParagraph: "cellpara0001",
  cellParagraphSecond: "cellpara0002",
  layout: "layout000001",
  section: "section00001",
  sectionParagraph: "secpara00001",
  sectionParagraphSecond: "secpara00002",
  region: "region000001",
  surface: "surface00001",
});

const projectionApplication = createProjectionApplication();
const mountedEditors: MountedEditor[] = [];
let projectionTracerControlActivations = 0;

afterEach(() => {
  projectionTracerControlActivations = 0;
  for (const mounted of mountedEditors.splice(0)) {
    mounted.root.unmount();
    mounted.editor.destroy();
    mounted.host.remove();
  }
});

describe("mounted content-layout projection tracer", () => {
  it("lands node decoration attributes on every production owner outer DOM", async () => {
    const documentContent = createProjectionDocument();

    for (const lane of ["authoring", "runtime"] as const) {
      const mounted = await mountEditor(lane, documentContent);

      await waitForCondition(
        () =>
          OWNER_SPECS.every(({ id, isReady }) => {
            const dom = findNodeDom(mounted.editor, id);
            return dom !== null && isReady(lane, dom);
          }),
        `${lane} owner DOMs`,
        8_000,
        () =>
          OWNER_SPECS.map(({ id, label }) => {
            const dom = findNodeDom(mounted.editor, id);
            return `${label}:${dom?.outerHTML ?? "<missing>"}`;
          }).join("\n"),
      );

      for (const owner of OWNER_SPECS) {
        const dom = findNodeDom(mounted.editor, owner.id);
        if (!dom) throw new Error(`Missing mounted DOM for ${owner.label}.`);

        expect(dom).toHaveAttribute("data-projection-tracer", owner.id);
        expect(dom.querySelector(`[data-projection-tracer="${owner.id}"]`)).toBeNull();
        owner.assertShape(lane, dom);
      }
    }
  });
});

describe("mounted content-layout projection", () => {
  it("contains withheld focus, pointer, accessibility, paint, and mounted identity", async () => {
    for (const lane of ["authoring", "runtime"] as const) {
      const mounted = await mountEditor(lane, createProjectionDocument(), false);
      await waitForOwnerMatrix(mounted, lane);
      const activationsBeforeLane = projectionTracerControlActivations;

      const beforeIdentity = captureDomIdentity(mounted.editor);
      const ordinary = findNodeDom(mounted.editor, OWNER_IDS.ordinaryBlock);
      if (!ordinary) throw new Error("Missing ordinary projection owner.");
      const control = requiredElement<HTMLButtonElement>(
        ordinary,
        "[data-projection-tracer-control]",
      );

      if (lane === "authoring") {
        await waitForProjectedOwner(mounted.editor, OWNER_IDS.paragraph, "available");
        assertProjectedOwner(mounted.editor, OWNER_IDS.paragraph, "available");
        assertProjectedOwner(mounted.editor, OWNER_IDS.ordinaryBlock, "withheld");
        expect(
          mounted.editor.commands.setNodeSelection(
            findNodePosition(mounted.editor, OWNER_IDS.ordinaryBlock),
          ),
        ).toBe(true);
        mounted.editor.view.focus();
        await waitForProjectedOwner(mounted.editor, OWNER_IDS.ordinaryBlock, "available");
      } else {
        expectProjectionAbsent(mounted.editor);
      }

      control.focus();
      expect(document.activeElement).toBe(control);
      await userEvent.click(control);
      expect(projectionTracerControlActivations).toBe(activationsBeforeLane + 1);

      if (lane === "authoring") {
        const paragraphPosition = findNodePosition(mounted.editor, OWNER_IDS.paragraph);
        expect(
          mounted.editor.commands.setTextSelection({
            from: paragraphPosition + 1,
            to: paragraphPosition + 1,
          }),
        ).toBe(true);
      } else {
        dispatchProjectionBatch(
          mounted.editor,
          createProjectionBatch(mounted.editor, lane, [
            { containerId: OWNER_IDS.region, activeChildId: OWNER_IDS.paragraph },
          ]),
        );
      }
      await waitForProjectedOwner(mounted.editor, OWNER_IDS.ordinaryBlock, "withheld");

      expect(ordinary).toHaveAttribute("inert", "");
      expect(ordinary).toHaveAttribute("aria-hidden", "true");
      expect(getComputedStyle(ordinary).visibility).toBe("hidden");
      expect(getComputedStyle(ordinary).contentVisibility).toBe("hidden");
      expect(getComputedStyle(ordinary).pointerEvents).toBe("none");
      expect(getComputedStyle(ordinary).contain).toContain("paint");
      expect(getComputedStyle(ordinary).overflow).toMatch(/clip|hidden/);
      await waitForCondition(
        () => !ordinary.contains(document.activeElement),
        "withheld owner to lose focus",
      );
      expect(ordinary.contains(document.activeElement)).toBe(false);

      control.focus();
      expect(ordinary.contains(document.activeElement)).toBe(false);
      await userEvent.click(control, { force: true });
      expect(projectionTracerControlActivations).toBe(activationsBeforeLane + 1);
      expect(control.isConnected).toBe(true);
      expectDomIdentity(mounted.editor, beforeIdentity);
    }
  });

  it("lets an active nested Tabs control and scroll lane remain feature-owned", async () => {
    const mounted = await mountEditor("runtime", createProjectionDocument(), false);
    mounted.host.style.width = "800px";
    mounted.host.style.height = "600px";
    await nextFrame();
    await waitForOwnerMatrix(mounted, "runtime");
    const region = findNodeDom(mounted.editor, OWNER_IDS.region);
    if (!region) throw new Error("Missing nested Tabs region.");
    region.style.width = "400px";
    region.style.height = "500px";
    await nextFrame();

    dispatchProjectionBatch(
      mounted.editor,
      createProjectionBatch(mounted.editor, "runtime", [
        { containerId: OWNER_IDS.section, activeChildId: OWNER_IDS.sectionParagraph },
      ]),
    );
    await waitForProjectedOwner(mounted.editor, OWNER_IDS.sectionParagraph, "available");

    const layout = findNodeDom(mounted.editor, OWNER_IDS.layout);
    const section = findNodeDom(mounted.editor, OWNER_IDS.section);
    if (!layout || !section) {
      throw new Error("Missing nested Tabs production owners.");
    }
    const layoutFrame = requiredElement<HTMLElement>(layout, '[data-node="layout"]');
    const sectionFrame = requiredElement<HTMLElement>(section, '[data-node="section"]');
    const tabPanel = requiredElement<HTMLElement>(sectionFrame, '[role="tabpanel"]');
    const sectionScrollFrame = requiredElement<HTMLElement>(
      sectionFrame,
      "[data-bounded-scroll-frame]",
    );
    layoutFrame.style.height = "400px";
    layoutFrame.style.maxHeight = "400px";
    sectionFrame.style.height = "300px";
    sectionFrame.style.maxHeight = "300px";
    tabPanel.style.height = "300px";
    tabPanel.style.minHeight = "300px";
    sectionScrollFrame.style.height = "300px";
    sectionScrollFrame.style.minHeight = "300px";

    const tabs = Array.from(layout.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs).toHaveLength(1);
    expect(section).not.toHaveAttribute("inert");
    expect(findNodeDom(mounted.editor, OWNER_IDS.sectionParagraph)).toHaveAttribute(
      CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.slot,
      "shared",
    );

    const firstParagraph = findNodeDom(mounted.editor, OWNER_IDS.sectionParagraph);
    const firstViewport = requiredElement<HTMLElement>(section, "[data-bounded-scroll]");
    if (!firstParagraph) throw new Error("Missing first Tabs paragraph.");
    firstViewport.style.display = "block";
    firstViewport.style.height = "120px";
    firstViewport.style.minHeight = "120px";
    firstViewport.style.maxHeight = "120px";
    firstParagraph.style.minHeight = "480px";
    await waitForCondition(
      () => firstViewport.scrollHeight > firstViewport.clientHeight,
      "active first Tabs panel to overflow",
    );
    expect(firstViewport).not.toHaveAttribute("inert");

    await userEvent.click(tabs[0]!);
    await waitForCondition(
      () => tabs[0]?.getAttribute("aria-selected") === "true",
      "active Tabs trigger to remain active",
    );
    firstViewport.scrollTop = firstViewport.scrollHeight;
    firstViewport.dispatchEvent(new Event("scroll"));
    await nextFrame();
    expect(firstViewport.scrollTop).toBeGreaterThan(0);
    expect(firstViewport).not.toHaveAttribute("inert");
  });

  it("lets only the available Sequence owner drive bounded overflow and hints", async () => {
    const mounted = await mountEditor("runtime", createProjectionDocument(), false);
    mounted.host.style.width = "800px";
    mounted.host.style.height = "600px";
    await nextFrame();
    await waitForOwnerMatrix(mounted, "runtime");

    const paragraph = findNodeDom(mounted.editor, OWNER_IDS.paragraph);
    const resizable = findNodeDom(mounted.editor, OWNER_IDS.resizableBlock);
    const region = findNodeDom(mounted.editor, OWNER_IDS.region);
    if (!paragraph || !resizable || !region) throw new Error("Missing overflow tracer owners.");
    const resizableFill = resizable.querySelector<HTMLElement>('[data-bounded-placement="fill"]');
    if (!resizableFill) throw new Error("Missing resizable bounded-fill owner.");
    region.style.width = "400px";
    region.style.height = "500px";
    await nextFrame();
    const viewport = requiredElement<HTMLElement>(
      region,
      ":scope > [data-bounded-scroll-frame] > [data-bounded-scroll]",
    );
    const hint = requiredElement<HTMLElement>(
      region,
      ":scope > [data-bounded-scroll-frame] > [data-bounded-scroll-hint]",
    );

    expect(getComputedStyle(resizable).display).toBe("contents");
    paragraph.style.minHeight = "24px";
    resizableFill.style.minHeight = "560px";
    const inactiveTall = createProjectionBatch(mounted.editor, "runtime", [
      { containerId: OWNER_IDS.region, activeChildId: OWNER_IDS.paragraph },
    ]);
    dispatchProjectionBatch(mounted.editor, inactiveTall);
    await waitForProjectedOwner(mounted.editor, OWNER_IDS.paragraph, "available");
    await waitForCondition(
      () => !viewport.hasAttribute("data-bounded-scroll-overflow"),
      "inactive tall owner to stop driving overflow",
      8_000,
    );
    expect(viewport).not.toHaveAttribute("data-bounded-scroll-overflow");
    expect(getComputedStyle(hint).visibility).toBe("hidden");
    expect(getComputedStyle(resizable).display).toBe("block");

    paragraph.style.minHeight = "560px";
    const activeTall = createProjectionBatch(mounted.editor, "runtime", [
      { containerId: OWNER_IDS.region, activeChildId: OWNER_IDS.paragraph },
    ]);
    dispatchProjectionBatch(mounted.editor, activeTall);
    await waitForCondition(
      () => viewport.hasAttribute("data-bounded-scroll-overflow"),
      "active tall owner to drive overflow",
    );
    expect(viewport).toHaveAttribute("data-bounded-scroll-overflow");
    expect(viewport).not.toHaveAttribute("data-bounded-scroll-end");
    expect(getComputedStyle(hint).visibility).toBe("visible");
  });

  it("projects supplied Sequence state and preserves document and DOM identity", async () => {
    for (const lane of ["authoring", "runtime"] as const) {
      const mounted = await mountEditor(lane, createProjectionDocument(), false);
      await waitForOwnerMatrix(mounted, lane);

      const beforeJson = JSON.stringify(mounted.editor.getJSON());
      const initialDom = captureDomIdentity(mounted.editor);
      const outerBatch = createProjectionBatch(mounted.editor, lane, [
        { containerId: OWNER_IDS.region, activeChildId: OWNER_IDS.paragraph },
      ]);

      if (lane === "authoring") {
        await waitForProjectedOwner(mounted.editor, OWNER_IDS.paragraph, "available");
        assertProjectedOwner(mounted.editor, OWNER_IDS.paragraph, "available");
        assertProjectedOwner(mounted.editor, OWNER_IDS.ordinaryBlock, "withheld");
      } else {
        expectProjectionAbsent(mounted.editor);
      }
      dispatchProjectionBatch(mounted.editor, outerBatch);
      await waitForProjectedOwner(mounted.editor, OWNER_IDS.paragraph, "available");
      assertExactlyOneAvailable(mounted.editor, outerBatch);
      assertProjectedOwner(mounted.editor, OWNER_IDS.paragraph, "available");
      assertProjectedOwner(mounted.editor, OWNER_IDS.ordinaryBlock, "withheld");
      assertProjectedOwner(mounted.editor, OWNER_IDS.grid, "withheld");
      assertProjectedOwner(mounted.editor, OWNER_IDS.layout, "withheld");
      expectProjectionAbsentFor(mounted.editor, [
        OWNER_IDS.cellParagraph,
        OWNER_IDS.cellParagraphSecond,
        OWNER_IDS.sectionParagraph,
        OWNER_IDS.sectionParagraphSecond,
      ]);

      const allContainers = createProjectionBatch(mounted.editor, lane, [
        { containerId: OWNER_IDS.region, activeChildId: OWNER_IDS.ordinaryBlock },
        { containerId: OWNER_IDS.cell, activeChildId: OWNER_IDS.cellParagraph },
        { containerId: OWNER_IDS.section, activeChildId: OWNER_IDS.sectionParagraph },
      ]);
      dispatchProjectionBatch(mounted.editor, allContainers);
      await waitForProjectedOwner(mounted.editor, OWNER_IDS.ordinaryBlock, "available");
      assertExactlyOneAvailable(mounted.editor, allContainers);

      assertProjectedOwner(mounted.editor, OWNER_IDS.ordinaryBlock, "available");
      assertProjectedOwner(mounted.editor, OWNER_IDS.paragraph, "withheld");
      assertProjectedOwner(mounted.editor, OWNER_IDS.grid, "withheld");
      assertProjectedOwner(mounted.editor, OWNER_IDS.layout, "withheld");
      assertProjectedOwner(mounted.editor, OWNER_IDS.cellParagraph, "available");
      assertProjectedOwner(mounted.editor, OWNER_IDS.cellParagraphSecond, "withheld");
      assertProjectedOwner(mounted.editor, OWNER_IDS.sectionParagraph, "available");
      assertProjectedOwner(mounted.editor, OWNER_IDS.sectionParagraphSecond, "withheld");
      expect(readContentLayoutProjectionDiagnostics(mounted.editor.state)).toEqual([]);

      const switched = createProjectionBatch(mounted.editor, lane, [
        { containerId: OWNER_IDS.region, activeChildId: OWNER_IDS.grid },
        { containerId: OWNER_IDS.cell, activeChildId: OWNER_IDS.cellParagraphSecond },
        { containerId: OWNER_IDS.section, activeChildId: OWNER_IDS.sectionParagraphSecond },
      ]);
      dispatchProjectionBatch(mounted.editor, switched);
      await waitForProjectedOwner(mounted.editor, OWNER_IDS.grid, "available");
      assertExactlyOneAvailable(mounted.editor, switched);

      assertProjectedOwner(mounted.editor, OWNER_IDS.grid, "available");
      assertProjectedOwner(mounted.editor, OWNER_IDS.ordinaryBlock, "withheld");
      assertProjectedOwner(mounted.editor, OWNER_IDS.cellParagraphSecond, "available");
      assertProjectedOwner(mounted.editor, OWNER_IDS.cellParagraph, "withheld");
      assertProjectedOwner(mounted.editor, OWNER_IDS.sectionParagraphSecond, "available");
      assertProjectedOwner(mounted.editor, OWNER_IDS.sectionParagraph, "withheld");
      expect(JSON.stringify(mounted.editor.getJSON())).toBe(beforeJson);
      expectDomIdentity(mounted.editor, initialDom);

      const clearedInner = createProjectionBatch(mounted.editor, lane, [
        { containerId: OWNER_IDS.region, activeChildId: OWNER_IDS.grid },
      ]);
      dispatchProjectionBatch(mounted.editor, clearedInner);
      await waitForCondition(
        () =>
          !hasProjectionSlot(mounted.editor, OWNER_IDS.cellParagraphSecond) &&
          !hasProjectionSlot(mounted.editor, OWNER_IDS.sectionParagraphSecond),
        `${lane} inner projection clear`,
      );
      assertExactlyOneAvailable(mounted.editor, clearedInner);
      assertProjectedOwner(mounted.editor, OWNER_IDS.grid, "available");
      expectProjectionAbsentFor(mounted.editor, [
        OWNER_IDS.cellParagraph,
        OWNER_IDS.cellParagraphSecond,
        OWNER_IDS.sectionParagraph,
        OWNER_IDS.sectionParagraphSecond,
      ]);
      expect(JSON.stringify(mounted.editor.getJSON())).toBe(beforeJson);
      expectDomIdentity(mounted.editor, initialDom);

      const clearedOuter = createProjectionBatch(mounted.editor, lane, [
        { containerId: OWNER_IDS.cell, activeChildId: OWNER_IDS.cellParagraphSecond },
        { containerId: OWNER_IDS.section, activeChildId: OWNER_IDS.sectionParagraphSecond },
      ]);
      dispatchProjectionBatch(mounted.editor, clearedOuter);
      await waitForCondition(
        () => !hasProjectionSlot(mounted.editor, OWNER_IDS.grid),
        `${lane} outer projection clear`,
      );
      assertExactlyOneAvailable(mounted.editor, clearedOuter);
      expectProjectionAbsentFor(mounted.editor, [
        OWNER_IDS.paragraph,
        OWNER_IDS.ordinaryBlock,
        OWNER_IDS.grid,
        OWNER_IDS.layout,
      ]);
      assertProjectedOwner(mounted.editor, OWNER_IDS.cellParagraphSecond, "available");
      assertProjectedOwner(mounted.editor, OWNER_IDS.sectionParagraphSecond, "available");
      expect(JSON.stringify(mounted.editor.getJSON())).toBe(beforeJson);
      expectDomIdentity(mounted.editor, initialDom);

      mounted.editor.view.dispatch(clearContentLayoutProjectionMeta(mounted.editor.state.tr));
      await waitForCondition(
        () => !hasProjectionSlot(mounted.editor, OWNER_IDS.cellParagraphSecond),
        `${lane} projection clear`,
      );
      expectProjectionAbsent(mounted.editor);
      expect(JSON.stringify(mounted.editor.getJSON())).toBe(beforeJson);
      expectDomIdentity(mounted.editor, initialDom);
    }
  });

  it("fails open for invalid Sequence input while retaining diagnostics and reachability", async () => {
    const mounted = await mountEditor("runtime", createProjectionDocument(), false);
    await waitForOwnerMatrix(mounted, "runtime");
    const batch = createProjectionBatch(mounted.editor, "runtime", [
      { containerId: OWNER_IDS.region, activeChildId: null },
    ]);

    mounted.editor.view.dispatch(
      setContentLayoutProjectionBatchMeta(mounted.editor.state.tr, batch),
    );
    await nextFrame();

    expect(readContentLayoutProjectionDiagnostics(mounted.editor.state)).toEqual([
      expect.objectContaining({
        containerId: OWNER_IDS.region,
        issue: expect.objectContaining({ kind: "missing-active-child" }),
        kind: "projection-unavailable",
      }),
    ]);
    expectProjectionAbsent(mounted.editor);
    for (const id of [
      OWNER_IDS.paragraph,
      OWNER_IDS.ordinaryBlock,
      OWNER_IDS.grid,
      OWNER_IDS.layout,
    ]) {
      expect(findNodeDom(mounted.editor, id)?.isConnected).toBe(true);
    }
  });

  it("keeps valid Flow input ordinary and does not add projection attributes", async () => {
    const mounted = await mountEditor("runtime", createProjectionDocument("flow"), false);
    await waitForOwnerMatrix(mounted, "runtime");
    const batch = createProjectionBatch(mounted.editor, "runtime", [
      { containerId: OWNER_IDS.region, activeChildId: null },
      { containerId: OWNER_IDS.cell, activeChildId: null },
      { containerId: OWNER_IDS.section, activeChildId: null },
    ]);

    dispatchProjectionBatch(mounted.editor, batch);
    await nextFrame();

    expect(readContentLayoutProjectionDiagnostics(mounted.editor.state)).toEqual([]);
    expectProjectionAbsent(mounted.editor);
    const flowReactOwner = findNodeDom(mounted.editor, OWNER_IDS.ordinaryBlock);
    if (!flowReactOwner) throw new Error("Missing Flow React owner.");
    expect(getComputedStyle(flowReactOwner).display).toBe("contents");
  });
});

type ProjectionLane = "authoring" | "runtime";

const OWNER_SPECS = [
  {
    id: OWNER_IDS.paragraph,
    label: "Paragraph",
    isReady: (_lane: ProjectionLane, dom: HTMLElement) => dom.tagName === "P",
    assertShape: (_lane: ProjectionLane, dom: HTMLElement) => expect(dom.tagName).toBe("P"),
  },
  {
    id: OWNER_IDS.ordinaryBlock,
    label: "ordinary React Block",
    isReady: (_lane: ProjectionLane, dom: HTMLElement) => dom.classList.contains("react-renderer"),
    assertShape: (_lane: ProjectionLane, dom: HTMLElement) =>
      expect(dom.classList.contains("react-renderer")).toBe(true),
  },
  {
    id: OWNER_IDS.resizableBlock,
    label: "resizable bounded-fill Block",
    isReady: (lane: ProjectionLane, dom: HTMLElement) =>
      lane === "authoring"
        ? dom.getAttribute("data-bounded-placement") === "fill"
        : dom.classList.contains("react-renderer"),
    assertShape: (lane: ProjectionLane, dom: HTMLElement) => {
      if (lane === "authoring") {
        expect(dom.getAttribute("data-bounded-placement")).toBe("fill");
        expect(dom.hasAttribute("data-authoring-frame-wrapper")).toBe(false);
        return;
      }

      expect(dom.classList.contains("react-renderer")).toBe(true);
      expect(dom.querySelector('[data-bounded-placement="fill"]')).not.toBeNull();
    },
  },
  {
    id: OWNER_IDS.grid,
    label: "Grid",
    isReady: (_lane: ProjectionLane, dom: HTMLElement) => dom.classList.contains("react-renderer"),
    assertShape: (_lane: ProjectionLane, dom: HTMLElement) =>
      expect(dom.classList.contains("react-renderer")).toBe(true),
  },
  {
    id: OWNER_IDS.cell,
    label: "nested Cell",
    isReady: (_lane: ProjectionLane, dom: HTMLElement) => dom.classList.contains("react-renderer"),
    assertShape: (_lane: ProjectionLane, dom: HTMLElement) =>
      expect(dom.classList.contains("react-renderer")).toBe(true),
  },
  {
    id: OWNER_IDS.layout,
    label: "Layout",
    isReady: (_lane: ProjectionLane, dom: HTMLElement) => dom.classList.contains("react-renderer"),
    assertShape: (_lane: ProjectionLane, dom: HTMLElement) =>
      expect(dom.classList.contains("react-renderer")).toBe(true),
  },
  {
    id: OWNER_IDS.section,
    label: "nested Layout Section",
    isReady: (_lane: ProjectionLane, dom: HTMLElement) => dom.classList.contains("react-renderer"),
    assertShape: (_lane: ProjectionLane, dom: HTMLElement) =>
      expect(dom.classList.contains("react-renderer")).toBe(true),
  },
] as const;

interface MountedEditor {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly root: Root;
}

function createProjectionApplication() {
  const ordinaryDefinition = defineBlock({
    nodeType: ORDINARY_BLOCK_TYPE,
    title: "Tracer ordinary Block",
  });
  const resizableDefinition = defineBlock({
    boundedPlacement: "fill",
    frame: { resizable: true, resizeMode: "responsive" },
    nodeType: RESIZABLE_BLOCK_TYPE,
    title: "Tracer resizable Block",
  });

  return createScaffoldApplication({
    packs: [
      defineScaffoldExtensionPack({
        id: "content-layout-projection-tracer",
        blocks: [
          createTracerBlockCapability(ordinaryDefinition),
          createTracerBlockCapability(resizableDefinition),
        ],
      }),
    ],
  });
}

function createTracerBlockCapability(definition: BlockDefinition): BlockCapability {
  return {
    authoringExtension: createTracerAuthoringNode(definition),
    definition,
    runtimeExtension: createTracerRuntimeNode(definition),
  };
}

function createTracerAuthoringNode(definition: BlockDefinition) {
  return Node.create({
    name: definition.nodeType,
    group: "block",
    atom: true,
    selectable: true,

    addAttributes() {
      return { id: { default: null } };
    },

    parseHTML() {
      return [{ tag: `div[data-node="${definition.nodeType}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, "data-node": definition.nodeType }];
    },

    addNodeView() {
      return createBlockAuthoringNodeView({
        definition,
        view: { component: TracerBlockView },
      });
    },
  });
}

function createTracerRuntimeNode(definition: BlockDefinition) {
  return Node.create({
    name: definition.nodeType,
    group: "block",
    atom: true,
    selectable: true,

    addAttributes() {
      return { id: { default: null } };
    },

    parseHTML() {
      return [{ tag: `div[data-node="${definition.nodeType}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, "data-node": definition.nodeType }];
    },

    addNodeView() {
      return createBlockRuntimeNodeView({
        definition,
        view: { component: TracerBlockView },
      });
    },
  });
}

function TracerBlockView({ node }: ReactNodeViewProps) {
  return (
    <>
      <span data-projection-tracer-inner={String(node.attrs["id"] ?? "")} />
      <button
        type="button"
        data-projection-tracer-control=""
        onClick={() => {
          projectionTracerControlActivations += 1;
        }}
      >
        Tracer control
      </button>
    </>
  );
}

async function mountEditor(
  lane: "authoring" | "runtime",
  content: JSONContent,
  withTracer = true,
): Promise<MountedEditor> {
  const extensions =
    lane === "authoring"
      ? createCourseDocumentAuthoringExtensions({
          composition: projectionApplication.authoring,
          editable: true,
        })
      : createCourseDocumentRuntimeExtensions({ composition: projectionApplication.runtime });
  const editor = new Editor({
    editable: lane === "authoring",
    extensions: withTracer
      ? [...extensions, createProjectionTracerExtension(Object.values(OWNER_IDS))]
      : extensions,
    content,
  });
  const host = document.createElement("div");
  host.dataset.projectionTracerLane = lane;
  document.body.append(host);
  const root = createRoot(host);
  root.render(
    lane === "authoring" ? (
      createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, host)
    ) : (
      <EditorContent editor={editor} />
    ),
  );

  const mounted = { editor, host, root };
  mountedEditors.push(mounted);
  return mounted;
}

function createProjectionTracerExtension(ids: readonly string[]) {
  return Extension.create({
    name: "contentLayoutProjectionBrowserTracer",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            decorations: (state) => {
              const decorations: Decoration[] = [];
              state.doc.descendants((node, position) => {
                const id = node.attrs["id"];
                if (typeof id === "string" && ids.includes(id)) {
                  decorations.push(
                    Decoration.node(position, position + node.nodeSize, {
                      "data-projection-tracer": id,
                    }),
                  );
                }
                return true;
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}

interface ProjectionContainerSelection {
  readonly activeChildId: string | null;
  readonly containerId: string;
}

function createProjectionBatch(
  editor: Editor,
  lane: ProjectionLane,
  selections: readonly ProjectionContainerSelection[],
  revision = 1,
): ContentLayoutProjectionBatch {
  const courseStructure = projectAuthoringCourseStructure(editor.state.doc);
  if (!courseStructure) throw new Error("Projection fixture has no projectable course structure.");

  const definitions =
    lane === "authoring"
      ? projectionApplication.authoring.documentSemantics
      : projectionApplication.runtime.documentSemantics;
  const snapshot = projectSemanticDocument({
    courseStructure,
    definitions,
    doc: editor.state.doc,
    revision,
  });
  const containers = selections.map((selection) => {
    const containerId = embeddedNodeId(selection.containerId);
    const item = snapshot.itemById.get(containerId);
    if (!item) throw new Error(`Projection fixture is missing container ${selection.containerId}.`);
    if (!item.presentationContainer) {
      throw new Error(`Projection fixture container ${selection.containerId} is not eligible.`);
    }

    return Object.freeze({
      activeChildId:
        selection.activeChildId === null ? null : embeddedNodeId(selection.activeChildId),
      containerId,
      contentLayout: item.presentationContainer.contentLayout,
      directChildIds: Object.freeze(item.children.map(({ id }) => id)),
    });
  });

  return Object.freeze({ snapshot, containers: Object.freeze(containers) });
}

function embeddedNodeId(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}

function dispatchProjectionBatch(editor: Editor, batch: ContentLayoutProjectionBatch): void {
  editor.view.dispatch(setContentLayoutProjectionBatchMeta(editor.state.tr, batch));
}

async function waitForOwnerMatrix(mounted: MountedEditor, lane: ProjectionLane): Promise<void> {
  await waitForCondition(
    () =>
      OWNER_SPECS.every(({ id, isReady }) => {
        const dom = findNodeDom(mounted.editor, id);
        return dom !== null && isReady(lane, dom);
      }),
    `${lane} owner DOMs`,
  );
  await waitForCondition(
    () =>
      [
        OWNER_IDS.cellParagraph,
        OWNER_IDS.cellParagraphSecond,
        OWNER_IDS.sectionParagraph,
        OWNER_IDS.sectionParagraphSecond,
      ].every((id) => findNodeDom(mounted.editor, id) !== null),
    `${lane} nested direct child DOMs`,
  );
}

function captureDomIdentity(editor: Editor): ReadonlyMap<string, HTMLElement> {
  const entries: Array<readonly [string, HTMLElement]> = [];
  for (const id of Object.values(OWNER_IDS)) {
    const dom = findNodeDom(editor, id);
    if (dom) entries.push([id, dom]);
  }
  return new Map(entries);
}

function expectDomIdentity(editor: Editor, identity: ReadonlyMap<string, HTMLElement>): void {
  for (const [id, expectedDom] of identity) {
    expect(findNodeDom(editor, id)).toBe(expectedDom);
  }
}

function hasProjectionSlot(editor: Editor, id: string): boolean {
  return (
    findNodeDom(editor, id)?.getAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.slot) === "shared"
  );
}

function expectProjectionAbsent(editor: Editor): void {
  expectProjectionAbsentFor(editor, Object.values(OWNER_IDS));
}

function expectProjectionAbsentFor(editor: Editor, ids: readonly string[]): void {
  for (const id of ids) {
    expect(findNodeDom(editor, id)).not.toHaveAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.slot);
  }
}

function assertProjectedOwner(
  editor: Editor,
  id: string,
  availability: "available" | "withheld",
): void {
  const dom = findNodeDom(editor, id);
  if (!dom) throw new Error(`Missing projected owner ${id}.`);

  expect(dom).toHaveAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.slot, "shared");
  expect(dom).toHaveAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.availability, availability);
  expect(dom).toHaveAttribute(
    CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.interaction,
    availability === "available" ? "enabled" : "inert",
  );
  expect(dom).toHaveAttribute(
    CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.accessibility,
    availability === "available" ? "exposed" : "hidden",
  );
  expect(dom).toHaveAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.geometry, "shared-position");

  if (availability === "available") {
    expect(dom).not.toHaveAttribute("inert");
    expect(dom).not.toHaveAttribute("aria-hidden");
  } else {
    expect(dom).toHaveAttribute("inert", "");
    expect(dom).toHaveAttribute("aria-hidden", "true");
  }
}

function assertExactlyOneAvailable(editor: Editor, batch: ContentLayoutProjectionBatch): void {
  for (const container of batch.containers) {
    const available = container.directChildIds.filter((childId) => {
      const dom = findNodeDom(editor, childId);
      return dom?.getAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.availability) === "available";
    });
    expect(available).toHaveLength(1);
  }
}

async function waitForProjectedOwner(
  editor: Editor,
  id: string,
  availability: "available" | "withheld",
): Promise<void> {
  await waitForCondition(
    () =>
      findNodeDom(editor, id)?.getAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.availability) ===
      availability,
    `${id} to become ${availability}`,
  );
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function createProjectionDocument(contentLayout: "flow" | "sequence" = "sequence"): JSONContent {
  const content = createScaffoldDocumentContent({
    initialCourseSectionTitle: "Projection tracer",
    mode: "slideshow",
    surfaceId: OWNER_IDS.surface,
  });
  const courseDocument = content.content?.[0];
  const courseSection = courseDocument?.content?.[0];
  if (!courseDocument || courseDocument.type !== "courseDocument") {
    throw new Error("Projection tracer fixture did not create a Course Document.");
  }
  if (!courseSection || courseSection.type !== "courseSection") {
    throw new Error("Projection tracer fixture did not create a Course Section.");
  }

  courseDocument.content = [courseSection, createProjectionSurface(contentLayout)];
  return content;
}

function createProjectionSurface(contentLayout: "flow" | "sequence"): JSONContent {
  return {
    type: "surface",
    attrs: {
      id: OWNER_IDS.surface,
      settings: {
        footer: { enabled: false },
        header: { enabled: false },
        slideTitle: { enabled: true },
      },
      variant: "slide-content",
    },
    content: [
      { type: "slide_title", attrs: { id: "slidetitle01" } },
      {
        type: "region",
        attrs: { contentLayout, id: OWNER_IDS.region, role: "main" },
        content: [
          {
            type: "paragraph",
            attrs: { id: OWNER_IDS.paragraph },
            content: [{ type: "text", text: "Tracer paragraph" }],
          },
          { type: ORDINARY_BLOCK_TYPE, attrs: { id: OWNER_IDS.ordinaryBlock } },
          { type: RESIZABLE_BLOCK_TYPE, attrs: { id: OWNER_IDS.resizableBlock } },
          {
            type: "grid",
            attrs: { id: OWNER_IDS.grid },
            content: [
              {
                type: "cell",
                attrs: { contentLayout, id: OWNER_IDS.cell },
                content: [
                  {
                    type: "paragraph",
                    attrs: { id: OWNER_IDS.cellParagraph },
                    content: [{ type: "text", text: "Cell paragraph" }],
                  },
                  {
                    type: "paragraph",
                    attrs: { id: OWNER_IDS.cellParagraphSecond },
                    content: [{ type: "text", text: "Second cell paragraph" }],
                  },
                ],
              },
            ],
          },
          {
            type: "layout",
            attrs: {
              id: OWNER_IDS.layout,
              options: { label: "Tracer tabs", variant: "default" },
              variant: "tabs",
            },
            content: [
              {
                type: "section",
                attrs: {
                  contentLayout,
                  id: OWNER_IDS.section,
                  label: "Tracer section",
                  options: { label: "Tracer section" },
                  role: "tab-panel",
                },
                content: [
                  {
                    type: "paragraph",
                    attrs: { id: OWNER_IDS.sectionParagraph },
                    content: [{ type: "text", text: "Section paragraph" }],
                  },
                  {
                    type: "paragraph",
                    attrs: { id: OWNER_IDS.sectionParagraphSecond },
                    content: [{ type: "text", text: "Second section paragraph" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function findNodeDom(editor: Editor, id: string): HTMLElement | null {
  let position: number | null = null;
  editor.state.doc.descendants((node, nodePosition) => {
    if (node.attrs["id"] === id) {
      position = nodePosition;
      return false;
    }
    return true;
  });
  if (position === null) return null;
  const dom = editor.view.nodeDOM(position);
  return dom instanceof HTMLElement ? dom : null;
}

function findNodePosition(editor: Editor, id: string): number {
  let position: number | null = null;
  editor.state.doc.descendants((node, nodePosition) => {
    if (node.attrs["id"] === id) {
      position = nodePosition;
      return false;
    }
    return true;
  });
  if (position === null) throw new Error(`Missing document node ${id}.`);
  return position;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}.`);
  return element;
}

async function waitForCondition(
  predicate: () => boolean,
  description: string,
  timeoutMs = 8_000,
  diagnostics?: () => string,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error(
    `Timed out waiting for ${description}.${diagnostics ? `\n${diagnostics()}` : ""}`,
  );
}
