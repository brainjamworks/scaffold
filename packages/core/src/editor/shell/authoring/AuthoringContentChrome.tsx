import type { Editor } from "@tiptap/core";
import { useMemo, useState, type ReactNode } from "react";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";
import type { SurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-view-registry";
import { createGridFloatingAuthoringControls } from "@/editor/arrangements/grid/authoring/grid-floating-controls";
import { createLayoutFloatingAuthoringControls } from "@/editor/arrangements/layout/authoring/layout-floating-controls";
import { EditorMovementLayer } from "@/editor/drag/view/EditorMovementLayer";
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
  overlayContainer?: Element | null;
  surfaceAuthoringChrome: SurfaceAuthoringChromeResolver;
  surfaceVariants: SurfaceVariantLookup;
}

export function AuthoringContentChrome({
  additionalFloatingControls = [],
  blockDefinitions,
  children,
  editable,
  editor,
  overlayContainer,
  surfaceAuthoringChrome,
  surfaceVariants,
}: AuthoringContentChromeProps) {
  const [ownerRoot, setOwnerRoot] = useState<HTMLDivElement | null>(null);
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
        {...(overlayContainer !== undefined ? { container: overlayContainer } : {})}
      >
        <div
          ref={setOwnerRoot}
          className="sc-authoring-chrome-root"
          {...authoringInteractionRootAttributes()}
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
        </div>
      </AuthoringOverlayBoundary>
    </InteractionProvider>
  );
}
