// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { SCAFFOLD_LEARNER_ACTIVITY_SNAPSHOT_VERSION } from "@scaffold/contracts";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import type { LearnerActivityPort, LearningEventPort } from "@/host/ports";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { LearnerActivityRuntimeProvider } from "@/runtime/learner-activity";
import { LearningEventRuntimeProvider } from "@/runtime/learning-events/LearningEventRuntimeProvider";
import {
  LEARNING_EVENT_EXTENSIONS,
  LEARNING_EVENT_VERBS,
} from "@/runtime/learning-events/catalogue";
import { ChecklistAuthoringExtension } from "./checklist-authoring-extension";
import { ChecklistRuntimeExtension } from "./checklist-runtime-extension";
import {
  CHECKLIST_ITEM_NODE,
  CHECKLIST_NODE,
  checklistItemContent,
  emptyChecklistData,
} from "./content";
import "./checklist-definition";

it("constructs serialized defaults in the Checklist feature", () => {
  expect(emptyChecklistData()).toEqual({
    type: "checklist",
    showProgress: true,
    showReset: true,
  });
  expect(emptyChecklistData({ showProgress: false, showReset: false })).toEqual({
    type: "checklist",
    showProgress: false,
    showReset: false,
  });
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "checklist",
  actionId: "checklist",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function checklistFixture(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: CHECKLIST_NODE,
        attrs: {
          id: "checklist-delete-fixture",
          data: emptyChecklistData(),
        },
        content: [
          {
            type: CHECKLIST_ITEM_NODE,
            attrs: { id: "checklist-item-one" },
            content: checklistItemContent("First checklist item"),
          },
          {
            type: CHECKLIST_ITEM_NODE,
            attrs: { id: "checklist-item-two" },
            content: checklistItemContent("Second checklist item"),
          },
          {
            type: CHECKLIST_ITEM_NODE,
            attrs: { id: "checklist-item-three" },
            content: checklistItemContent("Third checklist item"),
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Keep after checklist" }],
      },
    ],
  };
}

function renderChecklistEditor(content: JSONContent = checklistFixture()) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([CHECKLIST_NODE]),
      ChecklistAuthoringExtension,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
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

it("renders an item-shaped add checklist affordance", async () => {
  const fixture = renderChecklistEditor();
  const add = await screen.findByRole("button", { name: "Add item" });

  expect(add.classList.contains("sc-ghost-add--item")).toBe(true);
  expect(add.querySelector(".sc-checklist-item__checkbox--ghost")).not.toBeNull();
  fixture.destroy();
});

it("registers checklist rows for activated contained movement", async () => {
  const fixture = renderChecklistEditor();
  const handles = await screen.findAllByRole("button", {
    name: "Move checklist item within its group",
  });

  expect(handles).toHaveLength(3);
  expect(document.body.querySelectorAll("[data-contained-movement-target]")).toHaveLength(3);
  expect(document.body.querySelector("[data-authoring-move-handle]")).toBeNull();
  expect(handles[1]).toHaveAttribute(
    "aria-keyshortcuts",
    "Space Enter ArrowUp ArrowDown Escape",
  );

  fixture.destroy();
});

function renderChecklistRuntimeEditor({
  learnerActivityPort,
  learningEventPort,
}: {
  learnerActivityPort: LearnerActivityPort;
  learningEventPort: LearningEventPort;
}) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([CHECKLIST_NODE]),
      ChecklistRuntimeExtension,
    ],
    content: checklistFixture(),
  });

  render(
    createElement(ScaffoldServicesProvider, {
      ports: { learnerActivity: learnerActivityPort, learningEvents: learningEventPort },
      children: createElement(ScaffoldArtifactIdentityProvider, {
        artifactId: "checklist-artifact",
        children: createElement(LearningEventRuntimeProvider, {
          children: createElement(LearnerActivityRuntimeProvider, {
            initialSnapshot: {
              snapshotVersion: SCAFFOLD_LEARNER_ACTIVITY_SNAPSHOT_VERSION,
              artifactId: "checklist-artifact",
              activities: {
                "checklist-delete-fixture": {
                  activityKind: "checklist",
                  data: { checked: {} },
                  completed: false,
                  updatedAt: "2026-07-27T10:00:00Z",
                },
              },
            },
            children: createElement(EditorContent, { editor: fixture.editor }),
          }),
        }),
      }),
    }),
  );

  return fixture;
}

it("deletes the requested checklist item from a disposable editor fixture", async () => {
  const user = userEvent.setup();
  const fixture = renderChecklistEditor();

  await user.click(
    await screen.findByRole("button", {
      name: "Delete checklist item 2",
    }),
  );

  await waitFor(() => {
    expect(screen.queryByText("Second checklist item")).toBeNull();
  });

  const checklist = fixture.json().content?.[0];
  const itemIds = checklist?.content?.map((child) => child.attrs?.["id"]);

  expect(fixture.topLevelNodeTypes()).toEqual(["checklist", "paragraph"]);
  expect(fixture.editor.state.doc.textContent).toContain("Keep after checklist");
  expect(fixture.editor.state.doc.textContent).toContain("First checklist item");
  expect(fixture.editor.state.doc.textContent).toContain("Third checklist item");
  expect(itemIds).toEqual(["checklist-item-one", "checklist-item-three"]);

  fixture.destroy();
});

it("emits accepted checklist item details through one learner-activity save", async () => {
  const user = userEvent.setup();
  const save = vi.fn<LearnerActivityPort["save"]>(async ({ record }) => ({
    ...record,
    updatedAt: "2026-07-27T10:01:00Z",
  }));
  const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
  const fixture = renderChecklistRuntimeEditor({
    learnerActivityPort: {
      load: async () => null,
      save,
    },
    learningEventPort: {
      rootActivityId: "https://lms.example.test/courses/checklist-course",
      accept,
    },
  });

  const checkboxes = await screen.findAllByRole("checkbox", {
    name: "Mark item as complete",
  });
  await user.click(checkboxes[0]!);

  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  await waitFor(() => expect(accept).toHaveBeenCalledTimes(2));

  expect(save.mock.calls[0]?.[0].record).toMatchObject({
    data: { checked: { "checklist-item-one": true } },
    completed: false,
  });
  expect(accept.mock.calls[1]?.[0]).toMatchObject({
    verb: LEARNING_EVENT_VERBS.interacted,
    result: {
      extensions: {
        [LEARNING_EVENT_EXTENSIONS.learnerActivityEvent]: {
          action: "item-toggled",
          itemId: "checklist-item-one",
          checked: true,
          completedCount: 1,
          total: 3,
        },
      },
    },
  });

  fixture.destroy();
});

it("does not report a checklist interaction when the authoritative save is a no-op", async () => {
  const user = userEvent.setup();
  const save = vi.fn<LearnerActivityPort["save"]>(async ({ record }) => ({
    ...record,
    data: { checked: {} },
    completed: false,
    updatedAt: "2026-07-27T10:01:00Z",
  }));
  const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
  const fixture = renderChecklistRuntimeEditor({
    learnerActivityPort: {
      load: async () => null,
      save,
    },
    learningEventPort: {
      rootActivityId: "https://lms.example.test/courses/checklist-course",
      accept,
    },
  });

  const checkboxes = await screen.findAllByRole("checkbox", {
    name: "Mark item as complete",
  });
  await user.click(checkboxes[0]!);

  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(accept).not.toHaveBeenCalled();

  fixture.destroy();
});
