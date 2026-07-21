import { CopyIcon as Copy } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";

import { MenuIconButton } from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";
import {
  canDuplicateSurfaceAt,
  duplicateSurfaceAt,
} from "@/editor/surfaces/authoring/commands/surface-document-commands";

interface DuplicateSurfaceProps {
  editor: Editor;
  label?: string;
  pos?: number | null;
}

export function DuplicateSurface({
  editor,
  label = "Duplicate surface",
  pos,
}: DuplicateSurfaceProps) {
  const canDuplicate = pos !== null && pos !== undefined && canDuplicateSurfaceAt(editor, pos);

  return (
    <MenuIconButton
      icon={Copy}
      label={label}
      disabled={!canDuplicate}
      onClick={() => {
        if (!canDuplicate || pos === null || pos === undefined) return;
        duplicateSurfaceAt(editor, pos);
      }}
    />
  );
}
