// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createControlBindingRegistry,
  createControlBindingRegistryStorageExtension,
  getControlBindingRegistryForEditor,
  type ControlEvent,
} from "@/document/control-binding";

import {
  deliverAcceptedResourceLinkActivation,
  type ResourceLinkLearningReporter,
} from "./ResourceLinkRuntimeView";
import {
  createResourceLinkControlBindingController,
  useResourceLinkControlBinding,
} from "./resource-link-control-binding";
import { resourceLinkControlDefinition } from "./resource-link-control-definition";

const OWNER_ID = "resource0001" as EmbeddedNodeId;
const editors: Editor[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Resource Link Control Binding", () => {
  it("publishes every accepted activation and exposes no state or command facet", () => {
    const requireMounted = vi.fn();
    const controller = createResourceLinkControlBindingController({
      ownerId: OWNER_ID,
      requireMounted,
    });
    const events: ControlEvent[] = [];
    controller.binding.eventSource?.subscribe((event) => events.push(event));

    controller.publish();
    controller.publish();

    expect(events).toEqual([
      { targetId: OWNER_ID, type: "launched" },
      { targetId: OWNER_ID, type: "launched" },
    ]);
    expect(controller.binding.stateReader).toBeUndefined();
    expect(controller.binding.commandExecutor).toBeUndefined();
    expect(requireMounted).toHaveBeenCalledTimes(3);
  });

  it("delivers independent listeners before rethrowing the first Control defect", () => {
    const controller = createResourceLinkControlBindingController({
      ownerId: OWNER_ID,
      requireMounted: () => undefined,
    });
    const observed: ControlEvent[] = [];
    controller.binding.eventSource?.subscribe(() => {
      throw new Error("broken rule listener");
    });
    controller.binding.eventSource?.subscribe((event) => observed.push(event));

    expect(() => controller.publish()).toThrow("broken rule listener");
    expect(observed).toEqual([{ targetId: OWNER_ID, type: "launched" }]);
  });

  it("keeps Control and Learning delivery independent while preserving the Learning payload", () => {
    const publishControl = vi.fn();
    const report = vi.fn();
    const learningEventReporter: ResourceLinkLearningReporter = { report };

    deliverAcceptedResourceLinkActivation({
      learningEventReporter,
      publishControl,
      resourceId: OWNER_ID,
      resourceKind: "article",
    });
    expect(publishControl).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledExactlyOnceWith({
      type: "resource.launched",
      resourceId: OWNER_ID,
      resourceKind: "article",
    });

    report.mockImplementationOnce(() => {
      throw new Error("learning unavailable");
    });
    expect(() =>
      deliverAcceptedResourceLinkActivation({
        learningEventReporter,
        publishControl,
        resourceId: OWNER_ID,
        resourceKind: "article",
      }),
    ).not.toThrow();
    expect(publishControl).toHaveBeenCalledTimes(2);

    publishControl.mockImplementationOnce(() => {
      throw new Error("stale Control subscription");
    });
    expect(() =>
      deliverAcceptedResourceLinkActivation({
        learningEventReporter,
        publishControl,
        resourceId: OWNER_ID,
        resourceKind: "article",
      }),
    ).toThrow("stale Control subscription");
    expect(report).toHaveBeenCalledTimes(3);
  });

  it("mounts only a valid current runtime link, survives revisions, and tears down", async () => {
    const editor = createEditor("https://example.com/resource");
    let publish: () => void = () => undefined;
    const node = editor.state.doc.firstChild!;
    const view = render(
      <Harness editor={editor} node={node} onPublish={(next) => (publish = next)} />,
    );

    await waitFor(() =>
      expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeDefined(),
    );
    const binding = getControlBindingRegistryForEditor(editor).get(OWNER_ID)!;
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));
    act(() => publish());
    expect(events).toEqual([{ targetId: OWNER_ID, type: "launched" }]);

    editor.commands.updateAttributes("resource_link", { revision: 1 });
    const revisedNode = editor.state.doc.firstChild!;
    view.rerender(
      <Harness editor={editor} node={revisedNode} onPublish={(next) => (publish = next)} />,
    );
    expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBe(binding);

    editor.commands.clearContent();
    expect(() => publish()).toThrow(
      `Resource Link Control Binding owner "${OWNER_ID}" is no longer mounted.`,
    );
    view.unmount();
    expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeUndefined();
    expect(() => binding.eventSource?.subscribe(() => undefined)).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
  });

  it.each(["", "javascript:alert(1)", "mailto:learner@example.com"])(
    "does not mount an interactive binding for invalid URL %j",
    async (url) => {
      const editor = createEditor(url);
      const node = editor.state.doc.firstChild!;
      render(<Harness editor={editor} node={node} onPublish={() => undefined} />);

      await Promise.resolve();
      expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeUndefined();
    },
  );
});

function Harness({
  editor,
  node,
  onPublish,
}: {
  editor: Editor;
  node: NonNullable<Editor["state"]["doc"]["firstChild"]>;
  onPublish: (publish: () => void) => void;
}) {
  onPublish(
    useResourceLinkControlBinding({
      editor,
      getPos: () => 0,
      node,
    }),
  );
  return null;
}

function createEditor(url: string): Editor {
  const registry = createControlBindingRegistry({
    requireOwnerControlDefinition: () => resourceLinkControlDefinition,
    requireOwnedTargetCapabilities: (ownerId, targetId) => {
      if (ownerId !== OWNER_ID || targetId !== OWNER_ID) throw new Error("foreign target");
      return resourceLinkControlDefinition.owner!;
    },
  });
  const ResourceLinkNode = Node.create({
    name: "resource_link",
    group: "block",
    atom: true,
    addAttributes: () => ({
      id: { default: null },
      data: { default: null },
      revision: { default: 0 },
    }),
    parseHTML: () => [{ tag: "a[data-node=resource-link]" }],
    renderHTML: ({ HTMLAttributes }) => ["a", { ...HTMLAttributes, "data-node": "resource-link" }],
  });
  const editor = new Editor({
    content: {
      type: "doc",
      content: [
        {
          type: "resource_link",
          attrs: {
            id: OWNER_ID,
            data: { type: "resource_link", url, kind: "article", showDescription: true },
          },
        },
      ],
    },
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      ResourceLinkNode,
      createControlBindingRegistryStorageExtension({ getRegistry: () => registry }),
    ],
  });
  editors.push(editor);
  return editor;
}
