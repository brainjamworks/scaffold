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
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import type { LearnerActivityPort, XapiPort } from "@/host/ports";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { LearnerActivityRuntimeProvider } from "@/runtime/learner-activity";
import { XAPI_EXTENSIONS, XAPI_VERBS, XapiRuntimeProvider } from "@/runtime/xapi";
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
  catalogId: "checklist",
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
    ],
    content,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));

  return fixture;
}

function renderChecklistRuntimeEditor({
  learnerActivityPort,
  xapiPort,
}: {
  learnerActivityPort: LearnerActivityPort;
  xapiPort: XapiPort;
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
      ports: { learnerActivity: learnerActivityPort, xapi: xapiPort },
      children: createElement(ScaffoldArtifactIdentityProvider, {
        artifactId: "checklist-artifact",
        children: createElement(XapiRuntimeProvider, {
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
  const send = vi.fn<XapiPort["send"]>(async () => undefined);
  const fixture = renderChecklistRuntimeEditor({
    learnerActivityPort: {
      load: async () => null,
      save,
    },
    xapiPort: {
      activityId: "https://lms.example.test/courses/checklist-course",
      send,
    },
  });

  const checkboxes = await screen.findAllByRole("checkbox", {
    name: "Mark item as complete",
  });
  await user.click(checkboxes[0]!);

  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));

  expect(save.mock.calls[0]?.[0].record).toMatchObject({
    data: { checked: { "checklist-item-one": true } },
    completed: false,
  });
  expect(send.mock.calls[1]?.[0]).toMatchObject({
    verb: XAPI_VERBS.interacted,
    result: {
      extensions: {
        [XAPI_EXTENSIONS.learnerActivityEvent]: {
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
