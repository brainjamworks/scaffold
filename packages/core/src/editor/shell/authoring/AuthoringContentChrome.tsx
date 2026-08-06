import type { Editor } from "@tiptap/core";
import { useMemo, useState, type ReactNode } from "react";

import type { OverlayBoundaryKind } from "@/ui/overlays/portal-host-context";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";
import type { SurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-view-registry";
import { createGridFloatingAuthoringControls } from "@/editor/arrangements/grid/authoring/grid-floating-controls";
import { createLayoutFloatingAuthoringControls } from "@/editor/arrangements/layout/authoring/layout-floating-controls";
import { EditorMovementLayer } from "@/editor/movement/view/EditorMovementLayer";
import { createViewportCoordinateSpace } from "@/editor/interactions/drag/dom/dom-coordinate-space";
import { InteractionDragEnvironmentProvider } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { AuthoringOverlayBoundary } from "@/editor/interactions/floating/AuthoringOverlayBoundary";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { BubbleMenus } from "@/editor/shell/bubbles/BubbleMenus";
import { FloatingAuthoringChrome } from "@/editor/shell/authoring/floating/FloatingAuthoringChrome";
import type { FloatingControl } from "@/editor/shell/authoring/floating/floating-control";

export interface AuthoringContentChromeProps {
  additionalFloatingControls?: readonly FloatingControl[];
  blockDefinitions: BlockDefinitionLookup;
  children: ReactNode;
  editable: boolean;
  editor: Editor;
  overlayCollisionBoundary?: Element | null;
  overlayContainer?: Element | null;
  overlayKind?: OverlayBoundaryKind;
  surfaceAuthoringChrome: SurfaceAuthoringChromeResolver;
  surfaceVariants: SurfaceVariantLookup;
}

export function AuthoringContentChrome({
  additionalFloatingControls = [],
  blockDefinitions,
  children,
  editable,
  editor,
  overlayCollisionBoundary,
  overlayContainer,
  overlayKind,
  surfaceAuthoringChrome,
  surfaceVariants,
}: AuthoringContentChromeProps) {
  const [ownerRoot, setOwnerRoot] = useState<HTMLDivElement | null>(null);
  const coordinateSpace = useMemo(
    () =>
      ownerRoot
        ? createViewportCoordinateSpace({
            getRoot: () => ownerRoot,
            ownerDocument: ownerRoot.ownerDocument,
          })
        : null,
    [ownerRoot],
  );
  const canShowAuthoringChrome = editable && editor.isEditable;
  const contentFloatingControls = useMemo(
    () => [
      ...createGridFloatingAuthoringControls(blockDefinitions),
      ...createLayoutFloatingAuthoringControls(blockDefinitions),
    ],
    [blockDefinitions],
  );

  if (!canShowAuthoringChrome) return <>{children}</>;

  const interactionFacade = getInteractionFacadeStoreForEditor(editor);
  const floatingControls = [...additionalFloatingControls, ...contentFloatingControls];

  return (
    <InteractionProvider store={interactionFacade}>
      <AuthoringOverlayBoundary
        ownerRoot={ownerRoot}
        {...(overlayCollisionBoundary !== undefined
          ? { collisionBoundary: overlayCollisionBoundary }
          : {})}
        {...(overlayContainer !== undefined ? { container: overlayContainer } : {})}
        {...(overlayKind !== undefined ? { kind: overlayKind } : {})}
      >
        <div
          ref={setOwnerRoot}
          className="sc-authoring-chrome-root"
          {...authoringInteractionRootAttributes()}
        >
          <InteractionDragEnvironmentProvider
            coordinateRoot={ownerRoot}
            coordinateSpace={coordinateSpace}
          >
            <EditorMovementLayer
              blockDefinitions={blockDefinitions}
              editor={editor}
              surfaceVariants={surfaceVariants}
            >
              {children}
            </EditorMovementLayer>
            <FloatingAuthoringChrome controls={floatingControls} editor={editor} />
            <BubbleMenus
              blockDefinitions={blockDefinitions}
              editor={editor}
              surfaceAuthoringChrome={surfaceAuthoringChrome}
              surfaceVariants={surfaceVariants}
            />
          </InteractionDragEnvironmentProvider>
        </div>
      </AuthoringOverlayBoundary>
    </InteractionProvider>
  );
}
