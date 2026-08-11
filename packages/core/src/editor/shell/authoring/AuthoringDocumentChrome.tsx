import type { Editor } from "@tiptap/core";
import type { ReactNode } from "react";

import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { getScaffoldAuthoringCataloguesForEditor } from "@/composition/extensions/scaffold-authoring-catalogues-storage";
import type { OverlayBoundaryKind } from "@/ui/overlays/portal-host-context";
import { BlockStrip } from "@/editor/shell/chrome/BlockStrip";
import { SURFACE_FLOATING_AUTHORING_CONTROLS } from "@/editor/surfaces/authoring/chrome/surface-floating-controls";
import type { SurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-view-registry";
import { SurfaceTemplatePicker } from "@/editor/surfaces/authoring/SurfaceTemplatePickerHost";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";

import { AuthoringContentChrome } from "./AuthoringContentChrome";

export interface AuthoringDocumentChromeProps {
  children: ReactNode;
  courseAppearance?: ScaffoldColorMode;
  editable: boolean;
  editor: Editor;
  overlayCollisionBoundary?: Element | null;
  overlayContainer?: Element | null;
  overlayKind?: OverlayBoundaryKind;
  surfaceAuthoringChrome: SurfaceAuthoringChromeResolver;
}

export function AuthoringDocumentBlockStrip({ editor }: { editor: Editor }) {
  const { inDocument } = getScaffoldAuthoringCataloguesForEditor(editor);
  const capabilities = getScaffoldCapabilitiesForEditor(editor);

  return (
    <BlockStrip
      blockDefinitions={capabilities.blocks.registry}
      editor={editor}
      items={inDocument.actions}
      layoutDefinitions={capabilities.layouts.registry}
      surfaceVariants={capabilities.surfaces.registry}
    />
  );
}

export function AuthoringDocumentSurfaceTemplatePickerHost({
  courseAppearance = "light",
  editor,
}: {
  courseAppearance?: ScaffoldColorMode;
  editor: Editor;
}) {
  const { surfaceCreation } = getScaffoldAuthoringCataloguesForEditor(editor);
  const { surfaces } = getScaffoldCapabilitiesForEditor(editor);

  return (
    <SurfaceTemplatePicker
      courseAppearance={courseAppearance}
      editor={editor}
      surfaceCreationCatalog={surfaceCreation}
      surfaceVariants={surfaces.registry}
    />
  );
}

export function AuthoringDocumentChrome({
  children,
  courseAppearance = "light",
  editable,
  editor,
  overlayCollisionBoundary,
  overlayContainer,
  overlayKind,
  surfaceAuthoringChrome,
}: AuthoringDocumentChromeProps) {
  const canShowAuthoringChrome = editable && editor.isEditable;
  const capabilities = getScaffoldCapabilitiesForEditor(editor);

  return (
    <>
      <AuthoringContentChrome
        additionalFloatingControls={SURFACE_FLOATING_AUTHORING_CONTROLS}
        blockDefinitions={capabilities.blocks.registry}
        editable={editable}
        editor={editor}
        surfaceAuthoringChrome={surfaceAuthoringChrome}
        surfaceVariants={capabilities.surfaces.registry}
        {...(overlayCollisionBoundary !== undefined ? { overlayCollisionBoundary } : {})}
        {...(overlayContainer !== undefined ? { overlayContainer } : {})}
        {...(overlayKind !== undefined ? { overlayKind } : {})}
      >
        {children}
      </AuthoringContentChrome>
      {canShowAuthoringChrome ? (
        <AuthoringDocumentSurfaceTemplatePickerHost
          courseAppearance={courseAppearance}
          editor={editor}
        />
      ) : null}
    </>
  );
}
