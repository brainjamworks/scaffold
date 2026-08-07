import { CopyIcon as Copy } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";

import { MenuIconButton } from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";
import {
  canDuplicateSurface,
  duplicateSurface,
} from "@/editor/surfaces/authoring/commands/surface-document-commands";

interface DuplicateSurfaceProps {
  editor: Editor;
  label?: string;
  surfaceId?: string | null;
}

export function DuplicateSurface({
  editor,
  label = "Duplicate surface",
  surfaceId,
}: DuplicateSurfaceProps) {
  const canDuplicate = Boolean(surfaceId && canDuplicateSurface(editor, surfaceId));

  return (
    <MenuIconButton
      icon={Copy}
      label={label}
      disabled={!canDuplicate}
      onClick={() => {
        if (!canDuplicate || !surfaceId) return;
        duplicateSurface(editor, surfaceId);
      }}
    />
  );
}
