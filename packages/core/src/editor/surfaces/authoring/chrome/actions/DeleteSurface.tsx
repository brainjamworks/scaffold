import { TrashIcon as Trash } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";

import { MenuIconButton } from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";
import {
  canDeleteSurface,
  deleteSurface,
} from "@/editor/surfaces/authoring/commands/surface-document-commands";

interface DeleteSurfaceProps {
  editor: Editor;
  label?: string;
  surfaceId?: string | null;
}

export function DeleteSurface({ editor, label = "Delete surface", surfaceId }: DeleteSurfaceProps) {
  const canDelete = Boolean(surfaceId && canDeleteSurface(editor, surfaceId));

  return (
    <MenuIconButton
      destructive
      icon={Trash}
      label={label}
      disabled={!canDelete}
      onClick={() => {
        if (!canDelete || !surfaceId) return;
        deleteSurface(editor, surfaceId);
      }}
    />
  );
}
