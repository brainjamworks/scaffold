// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
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
  document.body.replaceChildren();
});

describe("Process Flow presentation block", () => {
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
    expect(handles).toHaveLength(3);
    expect(handles[0]).toHaveAttribute(
      "aria-keyshortcuts",
      "Space Enter ArrowLeft ArrowRight Escape",
    );
    expect(items[0]).toHaveAttribute("data-movement-target-axis", "horizontal");
    expect(region.querySelector(".sc-app-contained-movement-handle")).not.toBeNull();
    expect(region.querySelector(".sc-app-compact-movement-handle")).not.toBeNull();
    expect(region.querySelector(".sc-course-process-flow__add")).not.toBeNull();
    expect(region.querySelector(".sc-course-process-flow__move")).not.toBeNull();
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
  flow.attrs = { ...flow.attrs, id: "processflow01" };
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

function renderProcessFlowEditor(content: JSONContent = processFlowFixture(), editable = true) {
  const fixture = createDisposableEditor({
    editable,
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
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
