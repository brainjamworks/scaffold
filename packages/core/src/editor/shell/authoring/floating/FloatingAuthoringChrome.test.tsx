// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  AUTHORING_CHROME_ATTR,
  AuthoringChromeKind,
} from "@/editor/interactions/dom/authoring-chrome";
import {
  AUTHORING_ANCHOR_ATTR,
  gridAuthoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import {
  createInteractionStore,
  type InteractionCommandPorts,
} from "@/editor/interactions/targets/facade/interaction-store";
import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { STRUCTURAL_FLOATING_POINT_PLACEMENT } from "@/editor/interactions/floating/structural-floating-geometry";
import { iconXs } from "@/ui/tokens/icon-sizes";

import { FloatingAuthoringChrome } from "./FloatingAuthoringChrome";
import type { FloatingControl, FloatingTargetState } from "./floating-control";

const floatingPositionHookMock = vi.hoisted(() => ({
  applyDefaultPosition: (input: { floatingElement: HTMLElement | null }) => {
    if (!input.floatingElement) return;
    input.floatingElement.style.left = "32px";
    input.floatingElement.style.position = "absolute";
    input.floatingElement.style.top = "48px";
    input.floatingElement.style.visibility = "visible";
  },
  useEditorFloatingPosition: vi.fn(),
}));

vi.mock("@/editor/interactions/floating/useEditorFloatingPosition", () => floatingPositionHookMock);

const TestGridNode = Node.create({
  name: "grid",
  content: "paragraph+",
  defining: true,
  group: "block",

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-floating-authoring-test-grid]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        ...gridAuthoringFrameAttributes({ gridId: node.attrs["id"] }),
        "data-floating-authoring-test-grid": "",
      },
      0,
    ];
  },
});

const mountedEditors: Editor[] = [];

afterEach(() => {
  cleanup();
  while (mountedEditors.length) mountedEditors.pop()?.destroy();
  document.body.replaceChildren();
  floatingPositionHookMock.useEditorFloatingPosition.mockReset();
  floatingPositionHookMock.useEditorFloatingPosition.mockImplementation(
    floatingPositionHookMock.applyDefaultPosition,
  );
});

describe("FloatingAuthoringChrome", () => {
  beforeEach(() => {
    floatingPositionHookMock.useEditorFloatingPosition.mockImplementation(
      floatingPositionHookMock.applyDefaultPosition,
    );
  });

  it("renders a resolved control through the editor floating layer", async () => {
    const editor = makeEditor(gridContent());
    const control = createGridControl(editor);

    renderFloatingAuthoringChrome(editor, [control]);

    const trigger = await screen.findByRole("button", { name: "Grid options" });
    const floatingContent = trigger.parentElement;

    expect(floatingContent?.className).toContain("sc-editor-floating-content");
    expect(floatingContent?.style.left).toBe("32px");
    expect(floatingContent?.style.top).toBe("48px");
    expect(floatingContent?.style.transform).toBe("translate(-50%, -50%)");
    expect(trigger.style.transform).toBe("");
  });

  it("preserves authoring chrome attributes and anchor attributes", async () => {
    const editor = makeEditor(gridContent());
    const control = createGridControl(editor);

    renderFloatingAuthoringChrome(editor, [control]);

    const trigger = await screen.findByRole("button", { name: "Grid options" });

    expect(trigger.getAttribute(AUTHORING_CHROME_ATTR)).toBe(AuthoringChromeKind.Trigger);
    expect(trigger.getAttribute(AUTHORING_ANCHOR_ATTR)).toBe("grid-menu:grid-a");
    expect(trigger.getAttribute("data-grid-menu-trigger")).toBe("");
  });

  it("renders the configured icon", async () => {
    const editor = makeEditor(gridContent());
    const control = createGridControl(editor);

    renderFloatingAuthoringChrome(editor, [control]);

    const icon = await screen.findByTestId("floating-control-icon");

    expect(icon.getAttribute("data-size")).toBe(String(iconXs));
  });

  it("positions controls from a straddling structural point anchor", async () => {
    const editor = makeEditor(gridContent());
    const control = createGridControl(editor);

    renderFloatingAuthoringChrome(editor, [control]);

    await screen.findByRole("button", { name: "Grid options" });
    const frame = document.body.querySelector('[data-authoring-frame="grid"][data-id="grid-a"]');
    if (!frame) throw new Error("Expected grid frame.");
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 120, 420, 280));
    const input = latestFloatingPositionInput();
    const anchor = latestFloatingAnchor();

    expect(input.placement).toBe(STRUCTURAL_FLOATING_POINT_PLACEMENT);
    expect(input.offset).toBeUndefined();
    expect(anchor?.kind).toBe("virtual");
    expect(anchor?.getBoundingClientRect?.()).toMatchObject({
      height: 0,
      left: 100,
      top: 260,
      width: 0,
    });
  });

  it("supports historical top-right inset controls", async () => {
    const editor = makeEditor(gridContent());
    const control = createGridControl(editor, {
      alignment: "end-before-point",
      inlineOffset: -12,
      placement: "top-right",
    });

    renderFloatingAuthoringChrome(editor, [control]);

    const trigger = await screen.findByRole("button", { name: "Grid options" });
    const floatingContent = trigger.parentElement;
    const frame = document.body.querySelector('[data-authoring-frame="grid"][data-id="grid-a"]');
    if (!frame) throw new Error("Expected grid frame.");
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 120, 420, 280));
    const anchor = latestFloatingAnchor();

    expect(floatingContent?.style.transform).toBe("translate(-100%, -50%)");
    expect(anchor?.getBoundingClientRect?.()).toMatchObject({
      left: 508,
      top: 120,
    });
  });

  it("dispatches the control open command on click", async () => {
    const editor = makeEditor(gridContent());
    const toggleMenu = vi.fn(() => true);
    const open = vi.fn(({ commands, state }) => commands.toggleMenu(state.target));
    const control = createGridControl(editor, { open });

    renderFloatingAuthoringChrome(editor, [control], { toggleMenu });

    const trigger = await screen.findByRole("button", { name: "Grid options" });
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);

    expect(open).toHaveBeenCalledOnce();
    expect(toggleMenu).toHaveBeenCalledWith(gridTarget(editor));
  });

  it("keeps disabled controls disabled", async () => {
    const editor = makeEditor(gridContent());
    const control = createGridControl(editor, { disabled: true });

    renderFloatingAuthoringChrome(editor, [control]);

    const trigger = await screen.findByRole("button", { name: "Grid options" });

    expect(trigger.hasAttribute("disabled")).toBe(true);
  });

  it("does not render a control without a target state", async () => {
    const editor = makeEditor(gridContent());
    const control = createGridControl(editor, { resolveState: () => null });

    renderFloatingAuthoringChrome(editor, [control]);

    await waitFor(() => expect(screen.queryByRole("button", { name: "Grid options" })).toBeNull());
  });

  it("keeps the same floating anchor while the resolved target element is unchanged", async () => {
    const editor = makeEditor(gridContent());
    const control = createGridControl(editor);
    const store = createInteractionStore();
    editor.commands.focus("end");
    editor.view.dom.focus();

    const { rerender } = render(
      <InteractionProvider store={store}>
        <FloatingAuthoringChrome controls={[control]} editor={editor} />
      </InteractionProvider>,
    );

    await screen.findByRole("button", { name: "Grid options" });
    const firstAnchor = latestFloatingAnchor();
    const firstCallCount = floatingPositionHookMock.useEditorFloatingPosition.mock.calls.length;

    rerender(
      <InteractionProvider store={store}>
        <FloatingAuthoringChrome controls={[control]} editor={editor} />
      </InteractionProvider>,
    );

    await waitFor(() =>
      expect(floatingPositionHookMock.useEditorFloatingPosition.mock.calls.length).toBeGreaterThan(
        firstCallCount,
      ),
    );
    expect(latestFloatingAnchor()).toBe(firstAnchor);
  });
});

interface FloatingPositionHookInput {
  anchor: {
    getBoundingClientRect?: () => DOMRectReadOnly | null;
    kind?: string;
  } | null;
  offset?: unknown;
  placement?: string;
}

function latestFloatingPositionInput(): FloatingPositionHookInput {
  const calls = floatingPositionHookMock.useEditorFloatingPosition.mock.calls as unknown as Array<
    [FloatingPositionHookInput]
  >;
  const input = calls.at(-1)?.[0];
  if (!input) throw new Error("Expected floating position hook to have been called.");
  return input;
}

function latestFloatingAnchor(): FloatingPositionHookInput["anchor"] {
  return latestFloatingPositionInput().anchor;
}

function makeEditor(content: JSONContent): Editor {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: [StarterKit.configure({ undoRedo: false }), TestGridNode],
    content,
  });
  mountedEditors.push(editor);
  return editor;
}

function renderFloatingAuthoringChrome(
  editor: Editor,
  controls: readonly FloatingControl[],
  commandPorts: InteractionCommandPorts = {},
) {
  editor.commands.focus("end");
  editor.view.dom.focus();

  return render(
    <InteractionProvider store={createInteractionStore({ commandPorts })}>
      <FloatingAuthoringChrome controls={controls} editor={editor} />
    </InteractionProvider>,
  );
}

function createGridControl(
  editor: Editor,
  options: {
    alignment?: FloatingControl["alignment"];
    disabled?: boolean;
    inlineOffset?: FloatingControl["inlineOffset"];
    open?: FloatingControl["open"];
    placement?: FloatingControl["placement"];
    resolveState?: FloatingControl["resolveState"];
  } = {},
): FloatingControl {
  return {
    alignment: options.alignment ?? "centered-on-point",
    className: "sc-floating-control-trigger sc-floating-grid-menu-trigger",
    dataAttributes: {
      "data-grid-menu-trigger": "",
    },
    icon: TestIcon,
    ...(options.inlineOffset !== undefined ? { inlineOffset: options.inlineOffset } : {}),
    label: "Grid options",
    open: options.open ?? (() => true),
    placement: options.placement ?? "middle-left",
    resolveState:
      options.resolveState ??
      (() =>
        createFloatingTargetState({
          key: "grid-menu:grid-a",
          pos: nodePosById(editor, "grid-a"),
          target: gridTarget(editor),
          ...(options.disabled !== undefined ? { disabled: options.disabled } : {}),
          anchorId: "grid-menu:grid-a",
        })),
  };
}

function createFloatingTargetState(state: FloatingTargetState): FloatingTargetState {
  return state;
}

function TestIcon({ size }: { size?: number }) {
  return <span data-size={size ?? ""} data-testid="floating-control-icon" />;
}

function gridContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "grid",
        attrs: { id: "grid-a" },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "grid text" }],
          },
        ],
      },
    ],
  };
}

function gridTarget(editor: Editor): InteractionTargetRef {
  return {
    id: "grid-a",
    kind: InteractionTargetKind.Grid,
    pos: nodePosById(editor, "grid-a"),
  };
}

function nodePosById(editor: Editor, id: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.attrs["id"] === id) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`missing node ${id}`);
  return found;
}
