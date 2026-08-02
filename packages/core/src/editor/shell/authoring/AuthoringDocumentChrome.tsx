import type { Editor } from "@tiptap/core";
import type { ReactNode } from "react";

import { getScaffoldAuthoringCataloguesForEditor } from "@/composition/authoring/scaffold-authoring-catalogues-storage";
import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { BlockStrip } from "@/editor/shell/chrome/BlockStrip";
import { SURFACE_FLOATING_AUTHORING_CONTROLS } from "@/editor/surfaces/authoring/chrome/surface-floating-controls";
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";
import { SurfaceTemplatePickerHost } from "@/editor/surfaces/authoring/SurfaceTemplatePickerHost";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import { AuthoringContentChrome } from "./AuthoringContentChrome";

export interface AuthoringDocumentChromeProps {
  children: ReactNode;
  editable: boolean;
  editor: Editor;
  overlayContainer?: Element | null;
}

export function AuthoringDocumentBlockStrip({ editor }: { editor: Editor }) {
  const { inDocument } = getScaffoldAuthoringCataloguesForEditor(editor);
  const capabilities = getScaffoldCapabilitiesForEditor(editor);

  return (
    <BlockStrip
      blockDefinitions={capabilities.blocks.registry}
      editor={editor}
      items={inDocument.actions}
      surfaceVariants={capabilities.surfaces.registry}
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
