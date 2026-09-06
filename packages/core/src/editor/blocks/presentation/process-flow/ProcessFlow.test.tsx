// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, type Extensions, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import {
  createSemanticActivationBindingTestExtension,
  requireSemanticActivationBinding,
  semanticActivationRequest,
} from "@/document/authoring/testing/semantic-activation-binding-test-extension";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import {
  builtInBlockDefinitions,
  builtInBlockRegistry,
} from "@/editor/blocks/built-in-block-definitions";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createBlockInsertActions } from "@/editor/insertion/block-insert-action";
import { createInsertCatalog } from "@/editor/insertion/insert-catalog";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";

import {
  PROCESS_FLOW_NODE,
  PROCESS_FLOW_STEP_NODE,
  createProcessFlowContent,
  createProcessFlowStep,
  emptyProcessFlowData,
} from "./content";
import { ProcessFlowAuthoringExtension } from "./process-flow-authoring-extension";
import { processFlowBlockDefinition } from "./process-flow-definition";
import { ProcessFlowRuntimeExtension } from "./process-flow-runtime-extension";

const testCapabilities = createScaffoldApplication().capabilities;
const semanticRuntimeComposition = createCoreScaffoldRuntimeComposition();
const blockInsertCatalog = createInsertCatalog(
  createBlockInsertActions([processFlowBlockDefinition]),
);

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: PROCESS_FLOW_NODE,
  actionId: "process-flow",
  extensions: [createScaffoldInteractionOwnerExtension(builtInBlockRegistry)],
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("Process Flow presentation block", () => {
  it("registers semantic activation and reveals the requested step in its scrollport", async () => {
    const semanticHarness = createSemanticActivationBindingTestExtension();
    const fixture = renderProcessFlowEditor(processFlowFixture("horizontal"), true, [
      semanticHarness.extension,
    ]);
    const ownerId = EmbeddedNodeIdSchema.parse("procflow0001");
    const targetId = EmbeddedNodeIdSchema.parse("flowstep0003");
    const scrollport = await screen
      .findByRole("region", { name: "Process flow" })
      .then((region) => region.querySelector<HTMLElement>(".sc-course-process-flow__scrollport"));
    const target = document.querySelector<HTMLElement>(`[data-process-flow-step-id="${targetId}"]`);
    expect(scrollport).not.toBeNull();
    expect(target).not.toBeNull();
    const scrollTo = installHorizontalRevealGeometry(scrollport!, target!);
    const binding = await waitFor(() => {
      const resolution = semanticHarness.registry.resolve(ownerId);
      expect(resolution.kind).toBe("resolved");
      return requireSemanticActivationBinding(semanticHarness.registry, ownerId);
    });

    await expect(binding.activate(semanticActivationRequest(ownerId, targetId))).resolves.toEqual({
      kind: "revealed",
      ownerId,
      childId: targetId,
    });
    expect(scrollTo).toHaveBeenCalledOnce();

    fixture.destroy();
  });

  it("reveals the exact runtime step through the owned scrollport", async () => {
    const editor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions({
        composition: semanticRuntimeComposition,
      }),
      content: runtimeProcessFlowDocument("horizontal"),
    });
    const rendered = render(createElement(EditorContent, { editor }));
    const initiatingControl = document.createElement("button");
    const click = vi.fn();
    const keydown = vi.fn();
    const pointerdown = vi.fn();

    try {
      document.body.append(initiatingControl);
      initiatingControl.focus();
      document.addEventListener("click", click);
      document.addEventListener("keydown", keydown);
      document.addEventListener("pointerdown", pointerdown);
      const ownerId = EmbeddedNodeIdSchema.parse("procflow0001");
      const targetId = EmbeddedNodeIdSchema.parse("flowstep0003");
      const scrollport = await screen
        .findByRole("region", { name: "Process flow" })
        .then((region) => region.querySelector<HTMLElement>(".sc-course-process-flow__scrollport"));
      const target = editor.view.dom.querySelector<HTMLElement>(
        `[data-process-flow-step-id="${targetId}"]`,
      );
      expect(scrollport).not.toBeNull();
      expect(target).not.toBeNull();
      const scrollTo = installHorizontalRevealGeometry(scrollport!, target!);
      const environment = getSemanticTargetInteractionEnvironmentForEditor(editor);
      await waitFor(() => expect(environment.registry.resolve(ownerId).kind).toBe("resolved"));
      const authoredDocument = editor.getJSON();
      const selection = editor.state.selection.toJSON();

      await expect(
        environment.coordinator.activate(targetId, { origin: "configured-presentation" }),
      ).resolves.toEqual({ kind: "reached", requestedId: targetId });
      expect(scrollTo).toHaveBeenCalledOnce();
      expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", left: 260 });
      expect(editor.getJSON()).toEqual(authoredDocument);
      expect(editor.state.selection.toJSON()).toEqual(selection);
      expect(document.activeElement).toBe(initiatingControl);
      expect(click).not.toHaveBeenCalled();
      expect(keydown).not.toHaveBeenCalled();
      expect(pointerdown).not.toHaveBeenCalled();
      expect(editor.view.dom.querySelector('[class*="sc-app-process-flow"]')).toBeNull();

      rendered.unmount();
      expect(environment.registry.resolve(ownerId)).toEqual({
        kind: "unavailable",
        ownerId,
        reason: "owner-unmounted",
      });
    } finally {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", pointerdown);
      initiatingControl.remove();
      rendered.unmount();
      editor.destroy();
    }
  });

  it("interrupts a superseded runtime reveal before scrolling", async () => {
    const editor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions({
        composition: semanticRuntimeComposition,
      }),
      content: runtimeProcessFlowDocument("horizontal"),
    });
    const rendered = render(createElement(EditorContent, { editor }));

    try {
      const ownerId = EmbeddedNodeIdSchema.parse("procflow0001");
      const targetId = EmbeddedNodeIdSchema.parse("flowstep0003");
      const scrollport = await screen
        .findByRole("region", { name: "Process flow" })
        .then((region) => region.querySelector<HTMLElement>(".sc-course-process-flow__scrollport"));
      const target = editor.view.dom.querySelector<HTMLElement>(
        `[data-process-flow-step-id="${targetId}"]`,
      );
      expect(scrollport).not.toBeNull();
      expect(target).not.toBeNull();
      const scrollTo = installHorizontalRevealGeometry(scrollport!, target!);
      const environment = getSemanticTargetInteractionEnvironmentForEditor(editor);
      const binding = await waitFor(() => {
        const resolution = environment.registry.resolve(ownerId);
        expect(resolution.kind).toBe("resolved");
        if (resolution.kind !== "resolved") throw new Error("Missing Process Flow binding");
        return resolution.binding;
      });

      const superseded = binding.activate(semanticActivationRequest(ownerId, targetId));
      const current = binding.activate(semanticActivationRequest(ownerId, targetId));

      await expect(superseded).resolves.toEqual({
        kind: "interrupted",
        ownerId,
        childId: targetId,
      });
      await expect(current).resolves.toEqual({ kind: "revealed", ownerId, childId: targetId });
      expect(scrollTo).toHaveBeenCalledOnce();
    } finally {
      rendered.unmount();
      editor.destroy();
    }
  });

  it("returns child-missing when a pending step is removed before scrolling", async () => {
    const semanticHarness = createSemanticActivationBindingTestExtension();
    const fixture = renderProcessFlowEditor(processFlowFixture("horizontal"), true, [
      semanticHarness.extension,
    ]);
    const { editor } = fixture;

    try {
      const ownerId = EmbeddedNodeIdSchema.parse("procflow0001");
      const targetId = EmbeddedNodeIdSchema.parse("flowstep0003");
      const scrollport = await screen
        .findByRole("region", { name: "Process flow" })
        .then((region) => region.querySelector<HTMLElement>(".sc-course-process-flow__scrollport"));
      const targetElement = editor.view.dom.querySelector<HTMLElement>(
        `[data-process-flow-step-id="${targetId}"]`,
      );
      if (!scrollport || !targetElement) throw new Error("Missing Process Flow reveal DOM");
      const scrollTo = installHorizontalRevealGeometry(scrollport, targetElement);
      const binding = await waitFor(() => {
        const resolution = semanticHarness.registry.resolve(ownerId);
        expect(resolution.kind).toBe("resolved");
        if (resolution.kind !== "resolved") throw new Error("Missing Process Flow binding");
        return resolution.binding;
      });

      const activation = binding.activate(semanticActivationRequest(ownerId, targetId));
      const targetNode = findNodeById(editor, targetId);
      editor.view.dispatch(
        editor.state.tr.delete(targetNode.position, targetNode.position + targetNode.nodeSize),
      );
      expect(JSON.stringify(editor.getJSON())).not.toContain(targetId);

      await expect(activation).resolves.toEqual({
        kind: "unavailable",
        ownerId,
        childId: targetId,
        reason: "child-missing",
      });
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      fixture.destroy();
    }
  });

  it("returns temporarily-unavailable when the runtime step DOM is absent", async () => {
    const editor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions({
        composition: semanticRuntimeComposition,
      }),
      content: runtimeProcessFlowDocument("horizontal"),
    });
    const rendered = render(createElement(EditorContent, { editor }));

    try {
      const ownerId = EmbeddedNodeIdSchema.parse("procflow0001");
      const targetId = EmbeddedNodeIdSchema.parse("flowstep0003");
      const environment = getSemanticTargetInteractionEnvironmentForEditor(editor);
      const binding = await waitFor(() => {
        const resolution = environment.registry.resolve(ownerId);
        expect(resolution.kind).toBe("resolved");
        if (resolution.kind !== "resolved") throw new Error("Missing Process Flow binding");
        return resolution.binding;
      });
      const target = editor.view.dom.querySelector<HTMLElement>(
        `[data-process-flow-step-id="${targetId}"]`,
      );
      if (!target) throw new Error("Missing Process Flow target DOM");
      target.removeAttribute("data-process-flow-step-id");
      try {
        await expect(
          binding.activate(semanticActivationRequest(ownerId, targetId)),
        ).resolves.toEqual({
          kind: "unavailable",
          ownerId,
          childId: targetId,
          reason: "temporarily-unavailable",
        });
      } finally {
        target.dataset.processFlowStepId = targetId;
      }
    } finally {
      rendered.unmount();
      editor.destroy();
    }
  });

  it("uses auto scrolling for a reduced-motion runtime reveal", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const editor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions({
        composition: semanticRuntimeComposition,
      }),
      content: runtimeProcessFlowDocument("horizontal"),
    });
    const rendered = render(createElement(EditorContent, { editor }));

    try {
      const ownerId = EmbeddedNodeIdSchema.parse("procflow0001");
      const targetId = EmbeddedNodeIdSchema.parse("flowstep0003");
      const scrollport = await screen
        .findByRole("region", { name: "Process flow" })
        .then((region) => region.querySelector<HTMLElement>(".sc-course-process-flow__scrollport"));
      const target = editor.view.dom.querySelector<HTMLElement>(
        `[data-process-flow-step-id="${targetId}"]`,
      );
      if (!scrollport || !target) throw new Error("Missing Process Flow reveal DOM");
      const scrollTo = installHorizontalRevealGeometry(scrollport, target);
      const environment = getSemanticTargetInteractionEnvironmentForEditor(editor);
      await waitFor(() => expect(environment.registry.resolve(ownerId).kind).toBe("resolved"));

      await expect(
        environment.coordinator.activate(targetId, { origin: "configured-presentation" }),
      ).resolves.toEqual({ kind: "reached", requestedId: targetId });
      expect(scrollTo).toHaveBeenCalledWith({ behavior: "auto", left: 260 });
    } finally {
      rendered.unmount();
      editor.destroy();
    }
  });

  it("seeds structured Research, Draft, and Review steps with stable ids", () => {
    const content = blockInsertCatalog.getById("process-flow")?.content() as
      | JSONContent
      | undefined;

    expect(content?.type).toBe(PROCESS_FLOW_NODE);
    expect(content?.attrs?.["id"]).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    expect(content?.attrs?.["data"]).toEqual(emptyProcessFlowData());
    expect(content?.content?.map((step) => step.type)).toEqual([
      PROCESS_FLOW_STEP_NODE,
      PROCESS_FLOW_STEP_NODE,
      PROCESS_FLOW_STEP_NODE,
    ]);
    expect(content?.content?.map((step) => step.attrs?.["id"])).toEqual([
      expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/),
      expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/),
      expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/),
    ]);
    expect(content?.content?.map((step) => step.content?.[0]?.content?.[0]?.text)).toEqual([
      "Research",
      "Draft",
      "Review",
    ]);
    expect(builtInLayoutRegistry.getById("process-flow")).toBeUndefined();
    expect(builtInBlockRegistry.getByNodeType(PROCESS_FLOW_NODE)?.insert?.category).toBe("display");
    expect(
      builtInBlockDefinitions.filter(({ insert }) => insert?.id === "process-flow"),
    ).toHaveLength(1);
  });

  it("renders a Course-owned ordered sequence with orientation-truthful keyboard movement", async () => {
    const fixture = renderProcessFlowEditor(processFlowFixture("horizontal"));

    const region = await screen.findByRole("region", { name: "Process flow" });
    const list = screen.getByRole("list", { name: "Process steps" });
    const items = screen.getAllByRole("listitem");
    const handles = screen.getAllByRole("button", {
      name: "Move process flow step within its group",
    });

    expect(region.contains(list)).toBe(true);
    expect(items).toHaveLength(3);
    expect(list.tagName).toBe("DIV");
    expect(list).toHaveAttribute("role", "list");
    for (const item of items) {
      expect(item.tagName).toBe("DIV");
      expect(item).toHaveAttribute("role", "listitem");
      expect(item).not.toHaveAttribute("as");
    }
    expect(handles).toHaveLength(3);
    expect(handles[0]).toHaveAttribute(
      "aria-keyshortcuts",
      "Space Enter ArrowLeft ArrowRight Escape",
    );
    expect(items[0]).toHaveAttribute("data-movement-target-axis", "horizontal");
    expect(region.querySelector(".sc-app-contained-movement-handle")).not.toBeNull();
    expect(region.querySelector(".sc-app-compact-movement-handle")).not.toBeNull();
    expect(region.querySelector(".sc-app-block-add.sc-app-process-flow-add")).not.toBeNull();
    expect(region.querySelector(".sc-app-process-flow-move")).not.toBeNull();
    expect(region.querySelector(".sc-app-process-flow-delete")).not.toBeNull();
    expect(region.querySelector(".sc-course-process-flow__add")).toBeNull();
    expect(region.querySelector(".sc-course-process-flow__move")).toBeNull();
    expect(region.querySelector(".sc-course-process-flow__delete")).toBeNull();
    expect(region.querySelector(".sc-course-process-flow__move-visual")).toBeNull();

    fixture.destroy();
  });

  it("adds and deletes steps without disturbing following document content", async () => {
    const user = userEvent.setup();
    const fixture = renderProcessFlowEditor();

    await user.click(await screen.findByRole("button", { name: "Add step" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(4));

    const added = fixture.json().content?.[0]?.content?.[3];
    expect(added?.type).toBe(PROCESS_FLOW_STEP_NODE);
    expect(added?.attrs?.["id"]).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    expect(added?.content).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Delete process flow step 2" }));
    await waitFor(() => expect(screen.queryByText("Draft")).toBeNull());

    expect(fixture.topLevelNodeTypes()).toEqual([PROCESS_FLOW_NODE, "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after process flow");
    expect(fixture.json().content?.[0]?.content).toHaveLength(3);

    fixture.destroy();
  });

  it("keeps the last required step focusable and prevents its deletion", async () => {
    const fixtureContent = processFlowFixture("vertical");
    fixtureContent.content![0]!.content = [createProcessFlowStep(0, { title: "Only step" })];
    const fixture = renderProcessFlowEditor(fixtureContent);
    const deleteButton = await screen.findByRole("button", {
      name: "Delete process flow step 1",
    });

    expect(deleteButton).toHaveAttribute("aria-disabled", "true");
    expect(deleteButton).not.toHaveAttribute("disabled");
    expect(deleteButton).toHaveAccessibleDescription(
      "A process flow must contain at least one step.",
    );
    expect(
      screen.getByRole("button", { name: "Move process flow step within its group" }),
    ).toHaveAttribute("aria-keyshortcuts", "Space Enter ArrowUp ArrowDown Escape");

    fireEvent.click(deleteButton);
    expect(fixture.json().content?.[0]?.content).toHaveLength(1);
    fixture.destroy();
  });

  it("keeps author controls out of runtime and serializes native ordered semantics", async () => {
    const fixture = renderProcessFlowEditor(processFlowFixture("horizontal"), false);

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
    const region = screen.getByRole("region", { name: "Process flow" });
    expect(region.querySelector("button")).toBeNull();
    expect(region.querySelector('[class^="sc-app-"], [class*=" sc-app-"]')).toBeNull();

    const serialized = document.createElement("div");
    serialized.innerHTML = fixture.editor.getHTML();
    const section = serialized.querySelector('section[data-node="process-flow"]');
    const list = section?.querySelector(':scope > ol[aria-label="Process steps"]');
    expect(section?.getAttribute("aria-label")).toBe("Process flow");
    expect(list?.querySelectorAll(':scope > li[data-node="process-flow-step"]')).toHaveLength(3);

    fixture.destroy();
  });

  it("enforces a title and optional description in the step schema", () => {
    const fixture = renderProcessFlowEditor({
      type: "doc",
      content: [createProcessFlowContent()],
    });
    const stepType = fixture.editor.schema.nodes[PROCESS_FLOW_STEP_NODE];
    expect(stepType?.contentMatch.validEnd).toBe(false);

    const titleOnly = stepType?.createAndFill(
      undefined,
      fixture.editor.schema.nodes.paragraph?.create(),
    );
    expect(titleOnly?.childCount).toBe(1);
    expect(() =>
      stepType?.createChecked(undefined, [
        fixture.editor.schema.nodes.paragraph!.create(),
        fixture.editor.schema.nodes.paragraph!.create(),
        fixture.editor.schema.nodes.paragraph!.create(),
      ]),
    ).toThrow();

    fixture.destroy();
  });
});

function processFlowFixture(orientation: "horizontal" | "vertical" = "horizontal"): JSONContent {
  const flow = createProcessFlowContent({ orientation });
  flow.attrs = { ...flow.attrs, id: "procflow0001" };
  if (!flow.content) throw new Error("Expected Process Flow seed steps.");
  flow.content = flow.content.map((step, index) => ({
    ...step,
    attrs: { ...step.attrs, id: `flowstep000${index + 1}` },
  }));
  return {
    type: "doc",
    content: [
      flow,
      {
        type: "paragraph",
        content: [{ type: "text", text: "Keep after process flow" }],
      },
    ],
  };
}

function runtimeProcessFlowDocument(
  orientation: "horizontal" | "vertical" = "horizontal",
): JSONContent {
  const content = processFlowFixture(orientation).content?.slice(0, 1);
  if (!content) throw new Error("Process Flow runtime fixture has no content");
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceFlow1", variant: "page-default" },
            content,
          },
        ],
      },
    ],
  };
}

function renderProcessFlowEditor(
  content: JSONContent = processFlowFixture(),
  editable = true,
  extraExtensions: Extensions = [],
) {
  const fixture = createDisposableEditor({
    editable,
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      ...extraExtensions,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createScaffoldCapabilitiesStorageExtension(testCapabilities),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([PROCESS_FLOW_NODE]),
      editable ? ProcessFlowAuthoringExtension : ProcessFlowRuntimeExtension,
    ],
    content,
  });

  render(
    createAuthoringMovementTestRoot(
      fixture.editor,
      createElement(EditorContent, { editor: fixture.editor }),
    ),
  );

  return fixture;
}

function installHorizontalRevealGeometry(scrollport: HTMLElement, target: HTMLElement) {
  scrollport.getBoundingClientRect = () =>
    DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 100 });
  Object.defineProperty(scrollport, "clientWidth", { configurable: true, value: 200 });
  target.getBoundingClientRect = () => DOMRect.fromRect({ x: 320, y: 0, width: 80, height: 80 });
  const scrollTo = vi.fn();
  Object.defineProperty(scrollport, "scrollTo", { configurable: true, value: scrollTo });
  return scrollTo;
}

function findNodeById(editor: Editor, id: string) {
  const matches: Array<{ readonly position: number; readonly nodeSize: number }> = [];
  editor.state.doc.descendants((node, position) => {
    if (node.attrs["id"] !== id) return true;
    matches.push({ position, nodeSize: node.nodeSize });
    return false;
  });
  const found = matches[0];
  if (!found) throw new Error(`Missing node "${id}"`);
  return found;
}
