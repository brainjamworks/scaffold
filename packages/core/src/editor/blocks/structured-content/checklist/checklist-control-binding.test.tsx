// @vitest-environment jsdom

import type { EmbeddedNodeId, LearnerActivitySnapshot } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import {
  getControlBindingRegistryForEditor,
  type ControlBinding,
  type ControlEvent,
} from "@/document/control-binding";
import type { BlockDefinition } from "@/editor/blocks/block-definition";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import type { LearnerActivityPort, LearningEventPort } from "@/host/ports";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import {
  LearnerActivityReadinessGate,
  LearnerActivityRuntimeProvider,
} from "@/runtime/learner-activity";
import { LearningEventRuntimeProvider } from "@/runtime/learning-events/LearningEventRuntimeProvider";

import { checklistBlockDefinition } from "./checklist-definition";
import {
  CHECKLIST_ITEM_NODE,
  CHECKLIST_NODE,
  checklistItemContent,
  emptyChecklistData,
} from "./content";

const application = createScaffoldApplication();
const editors: Editor[] = [];
const OWNER_ID = "checklistCtl" as EmbeddedNodeId;
const FIRST_ITEM_ID = "checkitemC01" as EmbeddedNodeId;
const SECOND_ITEM_ID = "checkitemC02" as EmbeddedNodeId;

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Checklist Control Binding", () => {
  it("declares only the approved read-only owner and public-item capabilities", () => {
    expect((checklistBlockDefinition as BlockDefinition).control).toEqual({
      owner: {
        events: [{ type: "completed", label: "Completed" }],
        states: [
          {
            key: "completed",
            label: "Completed",
            valueType: { kind: "boolean" },
          },
        ],
      },
      semanticChildren: {
        checklist_item: {
          events: [
            { type: "checked", label: "Checked" },
            { type: "unchecked", label: "Unchecked" },
          ],
          states: [
            {
              key: "checked",
              label: "Checked",
              valueType: { kind: "boolean" },
            },
          ],
        },
      },
    });
  });

  it("publishes direct item facts after authoritative commits and keeps reset silent", async () => {
    const user = userEvent.setup();
    const save = vi.fn<LearnerActivityPort["save"]>(async ({ record }) => ({
      ...record,
      updatedAt: "2026-08-27T13:00:00Z",
    }));
    const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
    const editor = createRuntimeEditor();
    const rendered = renderRuntimeEditor(editor, { save, accept });
    const binding = await requireChecklistBinding(editor);
    const events: ControlEvent[] = [];
    const stateAtEvent: boolean[] = [];
    const unsubscribe = binding.eventSource?.subscribe((event) => {
      events.push(event);
      stateAtEvent.push(
        event.type === "completed"
          ? binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" }) === true
          : binding.stateReader?.read({ targetId: event.targetId, key: "checked" }) === true,
      );
    });

    expect(binding.commandExecutor).toBeUndefined();
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(false);
    expect(binding.stateReader?.read({ targetId: FIRST_ITEM_ID, key: "checked" })).toBe(false);
    expect(events).toEqual([]);

    await user.click(screen.getAllByRole("checkbox", { name: "Mark item as complete" })[0]!);
    await waitFor(() => expect(events).toEqual([{ targetId: FIRST_ITEM_ID, type: "checked" }]));
    await user.click(screen.getByRole("checkbox", { name: "Mark item as not complete" }));
    await waitFor(() =>
      expect(events.at(-1)).toEqual({ targetId: FIRST_ITEM_ID, type: "unchecked" }),
    );

    await user.click(screen.getAllByRole("checkbox", { name: "Mark item as complete" })[0]!);
    await waitFor(() =>
      expect(events.at(-1)).toEqual({ targetId: FIRST_ITEM_ID, type: "checked" }),
    );
    await user.click(screen.getAllByRole("checkbox", { name: "Mark item as complete" })[0]!);
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(true);
      expect(events.slice(-2)).toEqual([
        { targetId: SECOND_ITEM_ID, type: "checked" },
        { targetId: OWNER_ID, type: "completed" },
      ]);
    });

    await user.click(screen.getAllByRole("checkbox", { name: "Mark item as not complete" })[1]!);
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(false);
      expect(events.at(-1)).toEqual({ targetId: SECOND_ITEM_ID, type: "unchecked" });
    });
    expect(events.filter((event) => event.type === "completed")).toHaveLength(1);
    expect(stateAtEvent).toEqual([true, false, true, true, true, false]);

    await user.click(screen.getAllByRole("checkbox", { name: "Mark item as complete" })[0]!);
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(true);
      expect(events.slice(-2)).toEqual([
        { targetId: SECOND_ITEM_ID, type: "checked" },
        { targetId: OWNER_ID, type: "completed" },
      ]);
    });
    const eventCountBeforeReset = events.length;
    await user.click(screen.getByRole("button", { name: "Reset checklist" }));
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: FIRST_ITEM_ID, key: "checked" })).toBe(false);
      expect(binding.stateReader?.read({ targetId: SECOND_ITEM_ID, key: "checked" })).toBe(false);
      expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(false);
    });
    expect(events).toHaveLength(eventCountBeforeReset);

    rendered.unmount();
    await waitFor(() =>
      expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeUndefined(),
    );
    expect(() => binding.stateReader?.read({ targetId: FIRST_ITEM_ID, key: "checked" })).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
    unsubscribe?.();
  });

  it("reads hydrated authority and remains silent across host reconciliation and item revisions", async () => {
    const save = vi.fn<LearnerActivityPort["save"]>(async ({ record }) => ({
      ...record,
      data: { checked: {} },
      completed: false,
      updatedAt: "2026-08-27T13:00:00Z",
    }));
    const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
    const editor = createRuntimeEditor();
    const rendered = renderRuntimeEditor(editor, {
      save,
      accept,
      snapshot: checklistSnapshot(
        { checked: { [FIRST_ITEM_ID]: true, [SECOND_ITEM_ID]: true }, total: 2 },
        true,
      ),
    });
    const registry = getControlBindingRegistryForEditor(editor);
    const binding = await requireChecklistBinding(editor);
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(true);
    expect(binding.stateReader?.read({ targetId: FIRST_ITEM_ID, key: "checked" })).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_ITEM_ID, key: "checked" })).toBe(true);
    expect(events).toEqual([]);
    expect(() => registry.register(binding)).toThrow(
      `Duplicate Control Binding for owner "${OWNER_ID}".`,
    );
    expect(() =>
      binding.stateReader?.read({ targetId: "foreignItem1" as EmbeddedNodeId, key: "checked" }),
    ).toThrow(`Control target "foreignItem1" does not belong to owner "${OWNER_ID}".`);

    await userEvent.click(
      screen.getAllByRole("checkbox", { name: "Mark item as not complete" })[0]!,
    );
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: FIRST_ITEM_ID, key: "checked" })).toBe(false),
    );
    expect(events).toEqual([{ targetId: FIRST_ITEM_ID, type: "unchecked" }]);

    const secondPosition = requireNodePosition(editor, SECOND_ITEM_ID);
    const secondItem = editor.state.doc.nodeAt(secondPosition);
    if (!secondItem) throw new Error("Expected the second Checklist item node.");
    const replacementId = "checkitemC03" as EmbeddedNodeId;
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(secondPosition, undefined, { ...secondItem.attrs, id: replacementId })
        .setMeta("studentGuard", "allow"),
    );
    await waitFor(() => {
      expect(registry.get(OWNER_ID)).toBe(binding);
      expect(() =>
        binding.stateReader?.read({ targetId: SECOND_ITEM_ID, key: "checked" }),
      ).toThrow();
      expect(binding.stateReader?.read({ targetId: replacementId, key: "checked" })).toBe(false);
    });
    expect(events).toEqual([{ targetId: FIRST_ITEM_ID, type: "unchecked" }]);

    rendered.unmount();
    await waitFor(() => expect(registry.get(OWNER_ID)).toBeUndefined());
  });

  it("does not fabricate a Checklist learner binding in authoring", async () => {
    const editor = createAuthoringEditor();
    render(createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />));
    await screen.findByRole("button", { name: "Add item" });

    expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeUndefined();
  });
});

async function requireChecklistBinding(editor: Editor): Promise<ControlBinding> {
  const registry = getControlBindingRegistryForEditor(editor);
  await waitFor(() => expect(registry.get(OWNER_ID)).toBeDefined());
  const binding = registry.get(OWNER_ID);
  if (!binding) throw new Error("Expected mounted Checklist Control Binding.");
  return binding;
}

function createRuntimeEditor(): Editor {
  const editor = new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({ composition: application.runtime }),
    content: checklistDocument(),
  });
  editors.push(editor);
  return editor;
}

function createAuthoringEditor(): Editor {
  const environment = createCourseDocumentAuthoringEnvironment({
    composition: application.authoring,
    editable: true,
  });
  const editor = new Editor({
    editable: true,
    extensions: getCourseDocumentAuthoringEnvironmentState(environment).extensions,
    content: checklistDocument(),
  });
  editors.push(editor);
  return editor;
}

function renderRuntimeEditor(
  editor: Editor,
  {
    save,
    accept,
    snapshot = checklistSnapshot(),
  }: {
    save: LearnerActivityPort["save"];
    accept: LearningEventPort["accept"];
    snapshot?: LearnerActivitySnapshot;
  },
) {
  return render(
    <ScaffoldServicesProvider
      ports={{
        learnerActivity: { load: vi.fn(async () => null), save },
        learningEvents: {
          rootActivityId: "https://lms.example.test/courses/checklist-control",
          accept,
        },
      }}
    >
      <ScaffoldArtifactIdentityProvider artifactId="checklist-control">
        <LearningEventRuntimeProvider>
          <LearnerActivityRuntimeProvider initialSnapshot={snapshot}>
            <LearnerActivityReadinessGate>
              <EditorContent editor={editor} />
            </LearnerActivityReadinessGate>
          </LearnerActivityRuntimeProvider>
        </LearningEventRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>
    </ScaffoldServicesProvider>,
  );
}

function checklistSnapshot(
  data: LearnerActivitySnapshot["activities"][string]["data"] = { checked: {} },
  completed = false,
): LearnerActivitySnapshot {
  return {
    snapshotVersion: 1,
    artifactId: "checklist-control",
    activities: {
      [OWNER_ID]: {
        activityKind: "checklist",
        data,
        completed,
        updatedAt: "2026-08-27T12:00:00Z",
      },
    },
  };
}

function checklistDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "courseCheckCt", mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceCkCtl", variant: "page-default" },
            content: [
              {
                type: CHECKLIST_NODE,
                attrs: { id: OWNER_ID, data: emptyChecklistData() },
                content: [
                  checklistItem(FIRST_ITEM_ID, "First"),
                  checklistItem(SECOND_ITEM_ID, "Second"),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function checklistItem(id: EmbeddedNodeId, label: string): JSONContent {
  return {
    type: CHECKLIST_ITEM_NODE,
    attrs: { id },
    content: checklistItemContent(`${label} item`),
  };
}

function requireNodePosition(editor: Editor, id: EmbeddedNodeId): number {
  let position: number | undefined;
  editor.state.doc.descendants((node, nodePosition) => {
    if (node.attrs["id"] !== id) return true;
    position = nodePosition;
    return false;
  });
  if (position === undefined) throw new Error(`Expected document node "${id}".`);
  return position;
}
