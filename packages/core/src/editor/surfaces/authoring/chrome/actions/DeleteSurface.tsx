import { TrashIcon as Trash } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";

import { MenuIconButton } from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";
import {
  canDeleteSurfaceAt,
  deleteSurfaceAt,
} from "@/editor/surfaces/authoring/commands/surface-document-commands";

interface DeleteSurfaceProps {
  editor: Editor;
  label?: string;
  pos?: number | null;
}

export function DeleteSurface({ editor, label = "Delete surface", pos }: DeleteSurfaceProps) {
  const canDelete = pos !== null && pos !== undefined && canDeleteSurfaceAt(editor, pos);

  return (
    <MenuIconButton
      destructive
      icon={Trash}
      label={label}
      disabled={!canDelete}
      onClick={() => {
        if (!canDelete || pos === null || pos === undefined) return;
        deleteSurfaceAt(editor, pos);
      }}
    />
  );
}
