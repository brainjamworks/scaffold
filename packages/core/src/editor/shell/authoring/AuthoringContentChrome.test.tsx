// @vitest-environment happy-dom

import { render, screen, waitFor } from "@testing-library/react";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { LAYOUT_FLOATING_AUTHORING_CONTROLS } from "@/editor/arrangements/layout/authoring/layout-floating-controls";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";
import { AUTHORING_INTERACTION_ROOT_ATTR } from "@/editor/interactions/dom/authoring-root";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { useInteractionStore } from "@/editor/interactions/targets/facade/interaction-provider";
import type { InteractionStore } from "@/editor/interactions/targets/facade/interaction-store";
import { createInteractionOwnerCommandPorts } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-command-ports";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { interactionOwnerPluginKey } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-plugin-state";
import {
  useOverlayBoundary,
  type OverlayBoundaryEnvironment,
} from "@/ui/overlays/portal-host-context";

import { AuthoringContentChrome } from "./AuthoringContentChrome";

const TestLayoutNode = Node.create({
  name: "layout",
  group: "block",
  content: "block+",
  addAttributes() {
    return {
      id: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "section[data-test-layout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["section", { ...HTMLAttributes, "data-test-layout": "" }, 0];
  },
});

function createContentEditor(id: string) {
  return new Editor({
    editable: true,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestLayoutNode,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "layout",
          attrs: { id },
          content: [{ type: "paragraph" }],
        },
      ],
    },
  });
}

describe("AuthoringContentChrome", () => {
  it("gives simultaneous and nested editors one nearest contained overlay host each", async () => {
    const outerEditor = createContentEditor("layout-outer");
    const innerEditor = createContentEditor("layout-inner");
    const siblingEditor = createContentEditor("layout-sibling");
    const environments = new Map<string, OverlayBoundaryEnvironment>();

    function BoundaryProbe({ editorId }: { editorId: string }) {
      const resolution = useOverlayBoundary();
      if (resolution.status === "ready") environments.set(editorId, resolution.environment);
      return <div data-testid={`boundary-${editorId}`} data-status={resolution.status} />;
    }

    render(
      <>
        <AuthoringContentChrome
          blockDefinitions={builtInBlockRegistry}
          editable
          editor={outerEditor}
          surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
          surfaceVariants={builtInSurfaceVariantRegistry}
        >
          <BoundaryProbe editorId="outer" />
          <AuthoringContentChrome
            blockDefinitions={builtInBlockRegistry}
            editable
            editor={innerEditor}
            surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
            surfaceVariants={builtInSurfaceVariantRegistry}
          >
            <BoundaryProbe editorId="inner" />
          </AuthoringContentChrome>
        </AuthoringContentChrome>
        <AuthoringContentChrome
          blockDefinitions={builtInBlockRegistry}
          editable
          editor={siblingEditor}
          surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
          surfaceVariants={builtInSurfaceVariantRegistry}
        >
          <BoundaryProbe editorId="sibling" />
        </AuthoringContentChrome>
      </>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("boundary-outer").dataset.status).toBe("ready");
      expect(screen.getByTestId("boundary-inner").dataset.status).toBe("ready");
      expect(screen.getByTestId("boundary-sibling").dataset.status).toBe("ready");
    });

    const outerRoot = screen.getByTestId("boundary-outer").closest(".sc-authoring-chrome-root");
    const innerRoot = screen.getByTestId("boundary-inner").closest(".sc-authoring-chrome-root");
    const siblingRoot = screen.getByTestId("boundary-sibling").closest(".sc-authoring-chrome-root");

    expect(outerRoot?.querySelectorAll(":scope > [data-scaffold-overlay-host]")).toHaveLength(1);
    expect(innerRoot?.querySelectorAll(":scope > [data-scaffold-overlay-host]")).toHaveLength(1);
    expect(siblingRoot?.querySelectorAll(":scope > [data-scaffold-overlay-host]")).toHaveLength(1);
    expect(environments.get("outer")?.kind).toBe("contained");
    expect(environments.get("inner")?.kind).toBe("contained");
    expect(environments.get("sibling")?.kind).toBe("contained");
    expect(environments.get("inner")?.host).not.toBe(environments.get("outer")?.host);
    expect(environments.get("sibling")?.host).not.toBe(environments.get("outer")?.host);

    outerEditor.destroy();
    innerEditor.destroy();
    siblingEditor.destroy();
  });

  it("composes only content controls for an editor schema without Surface nodes", () => {
    const editor = createContentEditor("layout-content-only");

    render(
      <AuthoringContentChrome
        blockDefinitions={builtInBlockRegistry}
        editable
        editor={editor}
        surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
        surfaceVariants={builtInSurfaceVariantRegistry}
      >
        <div data-testid="content-only-editor" />
      </AuthoringContentChrome>,
    );

    expect(screen.getByTestId("scaffold-editor-movement-layer")).toBeInTheDocument();
    expect(
      screen.getByTestId("content-only-editor").closest(`[${AUTHORING_INTERACTION_ROOT_ATTR}]`),
    ).toBeInTheDocument();
    expect(
      document.body.querySelectorAll('[data-scaffold-editor-floating-layer-kind="authoring"]'),
    ).toHaveLength(1);
    const commands = createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry);
    expect(
      commands.activateStructuralTarget({
        id: "layout-content-only",
        kind: InteractionTargetKind.Layout,
        pos: 0,
      }),
    ).toBe(true);
    expect(LAYOUT_FLOATING_AUTHORING_CONTROLS[0].resolveState(editor)).toMatchObject({
      target: {
        id: "layout-content-only",
        kind: InteractionTargetKind.Layout,
      },
    });

    editor.destroy();
  });

  it("keeps interaction stores and plugin ownership isolated between simultaneous editors", () => {
    const firstEditor = createContentEditor("layout-first");
    const secondEditor = createContentEditor("layout-second");
    const providerStores = new Map<string, InteractionStore>();

    function InteractionStoreProbe({ editorId }: { editorId: string }) {
      providerStores.set(editorId, useInteractionStore());
      return <div data-testid={`editor-${editorId}`} />;
    }

    render(
      <>
        <AuthoringContentChrome
          blockDefinitions={builtInBlockRegistry}
          editable
          editor={firstEditor}
          surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
          surfaceVariants={builtInSurfaceVariantRegistry}
        >
          <InteractionStoreProbe editorId="first" />
        </AuthoringContentChrome>
        <AuthoringContentChrome
          blockDefinitions={builtInBlockRegistry}
          editable
          editor={secondEditor}
          surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
          surfaceVariants={builtInSurfaceVariantRegistry}
        >
          <InteractionStoreProbe editorId="second" />
        </AuthoringContentChrome>
      </>,
    );

    const firstStore = getInteractionFacadeStoreForEditor(firstEditor);
    const secondStore = getInteractionFacadeStoreForEditor(secondEditor);

    expect(providerStores.get("first")).toBe(firstStore);
    expect(providerStores.get("second")).toBe(secondStore);
    expect(firstStore).not.toBe(secondStore);
    expect(screen.getAllByTestId("scaffold-editor-movement-layer")).toHaveLength(2);
    expect(
      document.body.querySelectorAll('[data-scaffold-editor-floating-layer-kind="authoring"]'),
    ).toHaveLength(2);

    const firstCommands = createInteractionOwnerCommandPorts(
      firstEditor.view,
      builtInBlockRegistry,
    );
    expect(
      firstCommands.activateStructuralTarget({
        id: "layout-first",
        kind: InteractionTargetKind.Layout,
        pos: 0,
      }),
    ).toBe(true);

    expect(interactionOwnerPluginKey.getState(firstEditor.state)?.explicitOwner).toMatchObject({
      id: "layout-first",
      kind: InteractionTargetKind.Layout,
    });
    expect(interactionOwnerPluginKey.getState(secondEditor.state)?.explicitOwner).toBeNull();
    expect(firstStore.getState().snapshot.owners.explicitOwner.target).toMatchObject({
      id: "layout-first",
      kind: InteractionTargetKind.Layout,
    });
    expect(secondStore.getState().snapshot.owners.explicitOwner.target).toBeNull();

    firstEditor.destroy();
    secondEditor.destroy();
  });
});
