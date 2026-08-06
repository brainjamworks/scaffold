import type { Editor } from "@tiptap/core";
import { createElement, Fragment, type ReactElement, type ReactNode } from "react";

import { createViewportCoordinateSpace } from "@/editor/interactions/drag/dom/dom-coordinate-space";
import { InteractionDragEnvironmentProvider } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { AuthoringOverlayBoundary } from "@/editor/interactions/floating/AuthoringOverlayBoundary";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import { EditorMovementLayer } from "../view/EditorMovementLayer";

export function createAuthoringMovementTestRoot(
  editor: Editor,
  children: ReactNode,
  coordinateRoot: HTMLElement = document.body,
): ReactElement {
  if (!editor.isEditable) return createElement(Fragment, null, children);

  const coordinateSpace = createViewportCoordinateSpace({
    getRoot: () => coordinateRoot,
    ownerDocument: coordinateRoot.ownerDocument,
  });
  const movementLayer = createElement(
    EditorMovementLayer,
    {
      blockDefinitions: builtInBlockRegistry,
      editor,
      surfaceVariants: builtInSurfaceVariantRegistry,
    },
    children,
  );
  const dragEnvironment = createElement(InteractionDragEnvironmentProvider, {
    children: movementLayer,
    coordinateRoot,
    coordinateSpace,
  });
  const overlayBoundary = createElement(AuthoringOverlayBoundary, {
    children: dragEnvironment,
    ownerRoot: coordinateRoot,
  });

  return createElement(
    InteractionProvider,
    { store: getInteractionFacadeStoreForEditor(editor) },
    overlayBoundary,
  );
}
