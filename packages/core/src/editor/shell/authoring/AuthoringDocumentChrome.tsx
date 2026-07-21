import type { Editor } from "@tiptap/core";
import type { ReactNode } from "react";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { BlockStrip } from "@/editor/shell/chrome/BlockStrip";
import { SURFACE_FLOATING_AUTHORING_CONTROLS } from "@/editor/surfaces/authoring/chrome/surface-floating-controls";
import { SurfaceTemplatePickerHost } from "@/editor/surfaces/authoring/SurfaceTemplatePickerHost";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";

import { AuthoringContentChrome } from "./AuthoringContentChrome";

export interface AuthoringDocumentChromeProps {
  children: ReactNode;
  editable: boolean;
  editor: Editor;
  overlayContainer?: Element | null;
}

export function AuthoringDocumentBlockStrip({ editor }: { editor: Editor }) {
  return (
    <BlockStrip
      blockDefinitions={builtInBlockRegistry}
      editor={editor}
      items={builtInInsertCatalog.actions}
      surfaceVariants={builtInSurfaceVariantRegistry}
    />
  );
}

export function AuthoringDocumentChrome({
  children,
  editable,
  editor,
  overlayContainer,
}: AuthoringDocumentChromeProps) {
  const canShowAuthoringChrome = editable && editor.isEditable;

  return (
    <>
      <AuthoringContentChrome
        additionalFloatingControls={SURFACE_FLOATING_AUTHORING_CONTROLS}
        blockDefinitions={builtInBlockRegistry}
        editable={editable}
        editor={editor}
        surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
        surfaceVariants={builtInSurfaceVariantRegistry}
        {...(overlayContainer !== undefined ? { overlayContainer } : {})}
      >
        {children}
      </AuthoringContentChrome>
      {canShowAuthoringChrome ? <SurfaceTemplatePickerHost editor={editor} /> : null}
    </>
  );
}
