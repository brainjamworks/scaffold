// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

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
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";

import type { LayoutDefinition } from "../model/layout-definition";
import { tabsLayoutDefinition } from "./tabs-definition";

const application = createScaffoldApplication();
const editors: Editor[] = [];
const LAYOUT_ID = "layoutCtrl01" as EmbeddedNodeId;
const FIRST_SECTION_ID = "sectionCtl01" as EmbeddedNodeId;
const SECOND_SECTION_ID = "sectionCtl02" as EmbeddedNodeId;
const rangeClientRectsDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getClientRects",
);
const rangeBoundingRectDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getBoundingClientRect",
);
const windowScrollByDescriptor = Object.getOwnPropertyDescriptor(window, "scrollBy");

beforeAll(() => {
  const rect = DOMRect.fromRect({ height: 16, width: 80, x: 0, y: 0 });
  Object.defineProperties(Range.prototype, {
    getBoundingClientRect: { configurable: true, value: () => rect },
    getClientRects: { configurable: true, value: () => [rect] },
  });
  Object.defineProperty(window, "scrollBy", {
    configurable: true,
    value: () => undefined,
  });
});

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

afterAll(() => {
  restoreProperty(Range.prototype, "getClientRects", rangeClientRectsDescriptor);
  restoreProperty(Range.prototype, "getBoundingClientRect", rangeBoundingRectDescriptor);
  restoreProperty(window, "scrollBy", windowScrollByDescriptor);
});

describe("Tabs Control Binding", () => {
  it("declares only the selected Section event, state and select command", () => {
    expect((tabsLayoutDefinition as LayoutDefinition).control).toEqual({
      semanticChildren: {
        section: {
          events: [{ type: "selected", label: "Selected" }],
          states: [
            {
              key: "selected",
              label: "Selected",
              valueType: { kind: "boolean" },
            },
          ],
          commands: [{ type: "select", label: "Select" }],
        },
      },
    });
  });

  it("serves every runtime Section through current state, programmatic command and learner event", async () => {
    const user = userEvent.setup();
    const editor = createRuntimeTabsEditor();
    const rendered = render(createElement(EditorContent, { editor }));
    const registry = getControlBindingRegistryForEditor(editor);
    const binding = await requireTabsBinding(editor);
    const events: ControlEvent[] = [];
    const unsubscribe = binding.eventSource?.subscribe((event) => events.push(event));

    expect(events).toEqual([]);
    expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "selected" })).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "selected" })).toBe(false);

    const semanticEnvironment = getSemanticTargetInteractionEnvironmentForEditor(editor);
    await expect(
      semanticEnvironment.coordinator.activate(SECOND_SECTION_ID, {
        origin: "configured-presentation",
      }),
    ).resolves.toEqual({ kind: "reached", requestedId: SECOND_SECTION_ID });
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "selected" })).toBe(
        true,
      ),
    );
    expect(events).toEqual([]);

    const commandResult = await binding.commandExecutor?.execute({
      targetId: FIRST_SECTION_ID,
      type: "select",
      signal: new AbortController().signal,
    });
    expect(commandResult?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "selected" })).toBe(true);
    expect(events).toEqual([]);

    const abortAfterCommit = new AbortController();
    const committedResultPromise = binding.commandExecutor?.execute({
      targetId: SECOND_SECTION_ID,
      type: "select",
      signal: abortAfterCommit.signal,
    });
    abortAfterCommit.abort();
    const committedResult = await committedResultPromise;
    expect(committedResult?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "selected" })).toBe(true);
    expect(events).toEqual([]);

    const cancelled = new AbortController();
    cancelled.abort();
    const cancelledResult = await binding.commandExecutor?.execute({
      targetId: FIRST_SECTION_ID,
      type: "select",
      signal: cancelled.signal,
    });
    expect(cancelledResult?.isErr()).toBe(true);
    if (!cancelledResult || cancelledResult.isOk()) {
      throw new Error("Expected the aborted Tabs command to be cancelled.");
    }
    expect(cancelledResult.error).toEqual({ reason: "cancelled" });
    expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "selected" })).toBe(true);
    expect(events).toEqual([]);

    const practicePosition = requireNodePosition(editor, SECOND_SECTION_ID);
    const practiceSection = editor.state.doc.nodeAt(practicePosition);
    if (!practiceSection) throw new Error("Expected the Practice Section node.");
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(practicePosition, undefined, {
          ...practiceSection.attrs,
          options: { label: "Practice revised" },
        })
        .setMeta("studentGuard", "allow"),
    );
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Practice revised" })).toBeInTheDocument(),
    );
    expect(registry.get(LAYOUT_ID)).toBe(binding);

    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "selected" })).toBe(true);
      expect(events).toEqual([{ targetId: FIRST_SECTION_ID, type: "selected" }]);
    });

    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    overviewTab.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "selected" })).toBe(
        true,
      );
      expect(events).toEqual([
        { targetId: FIRST_SECTION_ID, type: "selected" },
        { targetId: SECOND_SECTION_ID, type: "selected" },
      ]);
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: "Practice revised" }),
      );
    });

    expect(() =>
      binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "unknown" }),
    ).toThrow(`Control state "unknown" is not declared for target "${FIRST_SECTION_ID}".`);
    await expect(
      binding.commandExecutor?.execute({
        targetId: FIRST_SECTION_ID,
        type: "unknown",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(
      `Control command "unknown" is not declared for target "${FIRST_SECTION_ID}".`,
    );
    expect(() =>
      binding.stateReader?.read({
        targetId: "foreignSec01" as EmbeddedNodeId,
        key: "selected",
      }),
    ).toThrow(`Control target "foreignSec01" does not belong to owner "${LAYOUT_ID}".`);

    rendered.unmount();
    await waitFor(() => expect(registry.get(LAYOUT_ID)).toBeUndefined());
    expect(editor.isDestroyed).toBe(false);
    expect(() =>
      binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "selected" }),
    ).toThrow(`Control Binding for owner "${LAYOUT_ID}" is no longer mounted.`);
    unsubscribe?.();
  });

  it("keeps the authoring binding mounted across Tabs node revisions", async () => {
    const user = userEvent.setup();
    const editor = createAuthoringTabsEditor();
    const rendered = render(
      createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })),
    );
    const registry = getControlBindingRegistryForEditor(editor);
    const binding = await requireTabsBinding(editor);
    const events: ControlEvent[] = [];
    const unsubscribe = binding.eventSource?.subscribe((event) => events.push(event));

    await user.click(screen.getByRole("tab", { name: "Practice" }));
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "selected" })).toBe(
        true,
      ),
    );
    expect(events).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Add tab" }));
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(3));
    expect(registry.get(LAYOUT_ID)).toBe(binding);
    expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "selected" })).toBe(
      false,
    );

    const commandResult = await binding.commandExecutor?.execute({
      targetId: FIRST_SECTION_ID,
      type: "select",
      signal: new AbortController().signal,
    });
    expect(commandResult?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "selected" })).toBe(true);
    expect(events).toEqual([]);

    rendered.unmount();
    await waitFor(() => expect(registry.get(LAYOUT_ID)).toBeUndefined());
    expect(editor.isDestroyed).toBe(false);
    expect(() =>
      binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "selected" }),
    ).toThrow(`Control Binding for owner "${LAYOUT_ID}" is no longer mounted.`);
    unsubscribe?.();
  });
});

async function requireTabsBinding(editor: Editor): Promise<ControlBinding> {
  const registry = getControlBindingRegistryForEditor(editor);
  await waitFor(() => expect(registry.get(LAYOUT_ID)).toBeDefined());
  const binding = registry.get(LAYOUT_ID);
  if (!binding) throw new Error("Expected mounted Tabs Control Binding.");
  return binding;
}

function createRuntimeTabsEditor(): Editor {
  return trackEditor(
    new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions({ composition: application.runtime }),
      content: tabsDocument(),
    }),
  );
}

function createAuthoringTabsEditor(): Editor {
  const environment = createCourseDocumentAuthoringEnvironment({
    composition: application.authoring,
    editable: true,
  });
  return trackEditor(
    new Editor({
      editable: true,
      extensions: getCourseDocumentAuthoringEnvironmentState(environment).extensions,
      content: tabsDocument(),
    }),
  );
}

function trackEditor(editor: Editor): Editor {
  editors.push(editor);
  return editor;
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

function tabsDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "courseDocCt1", mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceCtl01", variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: {
                  id: LAYOUT_ID,
                  variant: "tabs",
                  options: { variant: "default", label: "Lesson sections" },
                },
                content: [
                  tabSection(FIRST_SECTION_ID, "Overview", "paraCtrl0001"),
                  tabSection(SECOND_SECTION_ID, "Practice", "paraCtrl0002"),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function tabSection(id: EmbeddedNodeId, label: string, paragraphId: string): JSONContent {
  return {
    type: "section",
    attrs: { id, options: { label } },
    content: [
      {
        type: "paragraph",
        attrs: { id: paragraphId },
        content: [{ type: "text", text: label }],
      },
    ],
  };
}

function restoreProperty(
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }
  Reflect.deleteProperty(target, key);
}
