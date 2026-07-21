// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import {
  createInteractionChromeSlot,
  createInteractionOwnerSnapshot,
  InteractionChromeSlotReason,
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import {
  createInteractionStore,
  type InteractionStore,
} from "@/editor/interactions/targets/facade/interaction-store";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";

import { InteractionSettingsSheetHost } from "./InteractionSettingsSheetHost";

const HOST_BLOCK = "v2_settings_host_block";

const TestHostBlockNode = Node.create({
  name: HOST_BLOCK,
  group: "block",
  atom: true,

  addAttributes() {
    return {
      id: { default: null },
      settings: { default: {} },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-${HOST_BLOCK.replaceAll("_", "-")}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, [`data-${HOST_BLOCK.replaceAll("_", "-")}`]: "" }];
  },
});

const hostBlockDefinition = defineBlock({
  nodeType: HOST_BLOCK,
  configuration: defineConfiguration({
    attr: "settings",
    schema: z.object({ label: z.string().default("") }),
    sheet: {
      title: "Host block settings",
      sections: [{ id: "general", title: "General" }],
    },
    controls: [
      {
        kind: "text",
        name: "label",
        label: "Label",
        placement: { sheet: { section: "general" } },
      },
    ],
  }),
});

const testBlockRegistry = createBlockRegistry([hostBlockDefinition]);

const editors: Editor[] = [];

afterEach(() => {
  cleanup();
  while (editors.length > 0) editors.pop()?.destroy();
});

function makeEditor() {
  const editor = new Editor({
    extensions: [StarterKit.configure({ undoRedo: false }), TestHostBlockNode],
    content: {
      type: "doc",
      content: [
        { type: HOST_BLOCK, attrs: { id: "block-a", settings: { label: "Alpha" } } },
        { type: "paragraph" },
        { type: HOST_BLOCK, attrs: { id: "block-b", settings: { label: "Beta" } } },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function findBlockRef(editor: Editor, id = "block-a"): InteractionTargetRef {
  let pos = -1;
  editor.state.doc.descendants((node, nodePos) => {
    if (pos >= 0) return false;
    if (node.type.name === HOST_BLOCK && node.attrs["id"] === id) {
      pos = nodePos;
      return false;
    }
    return true;
  });
  if (pos < 0) throw new Error(`fixture block ${id} not found`);
  return { id, kind: InteractionTargetKind.Block, pos };
}

function settingsSnapshot(target: InteractionTargetRef, visible = true) {
  return createInteractionOwnerSnapshot({
    settingsOwner: target,
    chromeSlots: {
      settingsSheet: createInteractionChromeSlot({
        reason: visible
          ? InteractionChromeSlotReason.Allowed
          : InteractionChromeSlotReason.MissingTarget,
        target: visible ? target : null,
        visible,
      }),
    },
  });
}

function renderHost(editor: Editor, store: InteractionStore) {
  return render(
    <InteractionProvider store={store}>
      <InteractionSettingsSheetHost
        blockDefinitions={testBlockRegistry}
        editor={editor}
        surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
      />
    </InteractionProvider>,
  );
}

describe("InteractionSettingsSheetHost", () => {
  it("opens the sheet for a block settings owner", async () => {
    const editor = makeEditor();
    const store = createInteractionStore({
      snapshot: settingsSnapshot(findBlockRef(editor)),
    });

    renderHost(editor, store);

    expect(await screen.findByText("Host block settings")).toBeInTheDocument();
  });

  it("renders nothing when the settings sheet slot is hidden", () => {
    const editor = makeEditor();
    const dismissInteraction = vi.fn(() => true);
    const store = createInteractionStore({
      commandPorts: { dismissInteraction },
      snapshot: settingsSnapshot(findBlockRef(editor), false),
    });

    renderHost(editor, store);

    expect(screen.queryByText("Host block settings")).toBeNull();
    expect(dismissInteraction).not.toHaveBeenCalled();
  });

  it("renders nothing and dismisses when the settings target is stale", async () => {
    const editor = makeEditor();
    const dismissInteraction = vi.fn(() => true);
    const staleTarget: InteractionTargetRef = {
      id: "deleted-block",
      kind: InteractionTargetKind.Block,
    };
    const store = createInteractionStore({
      commandPorts: { dismissInteraction },
      snapshot: settingsSnapshot(staleTarget),
    });

    renderHost(editor, store);

    expect(screen.queryByText("Host block settings")).toBeNull();
    await waitFor(() => expect(dismissInteraction).toHaveBeenCalled());
  });

  it("renders nothing and dismisses for an unsupported structural target", async () => {
    const editor = makeEditor();
    const dismissInteraction = vi.fn(() => true);
    const gridTarget: InteractionTargetRef = {
      id: "grid-a",
      kind: InteractionTargetKind.Grid,
    };
    const store = createInteractionStore({
      commandPorts: { dismissInteraction },
      snapshot: settingsSnapshot(gridTarget),
    });

    renderHost(editor, store);

    expect(screen.queryByText("Host block settings")).toBeNull();
    await waitFor(() => expect(dismissInteraction).toHaveBeenCalled());
  });

  it("dismisses the interaction when the sheet is closed", async () => {
    const editor = makeEditor();
    const dismissInteraction = vi.fn(() => true);
    const store = createInteractionStore({
      commandPorts: { dismissInteraction },
      snapshot: settingsSnapshot(findBlockRef(editor)),
    });

    renderHost(editor, store);
    await screen.findByText("Host block settings");

    await userEvent.click(screen.getByRole("button", { name: "Close settings" }));

    expect(dismissInteraction).toHaveBeenCalled();
  });

  it("reopens against the live snapshot when the owner changes", async () => {
    const editor = makeEditor();
    const store = createInteractionStore({
      snapshot: settingsSnapshot(findBlockRef(editor)),
    });

    renderHost(editor, store);
    await screen.findByText("Host block settings");

    store.getState().publishSnapshot(createInteractionOwnerSnapshot());

    await waitFor(() => expect(screen.queryByText("Host block settings")).toBeNull());
  });

  it("does not let the previous sheet dismiss a replacement settings owner", async () => {
    const editor = makeEditor();
    const dismissInteraction = vi.fn(() => true);
    const store = createInteractionStore({
      commandPorts: { dismissInteraction },
      snapshot: settingsSnapshot(findBlockRef(editor, "block-a")),
    });

    renderHost(editor, store);
    expect(((await screen.findByLabelText("Label")) as HTMLInputElement).value).toBe("Alpha");

    store.getState().publishSnapshot(settingsSnapshot(findBlockRef(editor, "block-b")));

    await waitFor(() => {
      expect((screen.getByLabelText("Label") as HTMLInputElement).value).toBe("Beta");
    });
    await new Promise((resolve) => window.setTimeout(resolve, 10));

    expect(dismissInteraction).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Host block settings" })).toBeInTheDocument();
  });
});
