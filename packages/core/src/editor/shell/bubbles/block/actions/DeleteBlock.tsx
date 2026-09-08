import { TrashIcon as Trash } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";

import { requireLayerMutationAccessForState } from "@/document/authoring/layers/layer-editing-boundaries";
import { deleteNodeChecked } from "@/document/model/commands/checked-transactions";
import { MenuIconButton } from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";

interface DeleteBlockProps {
  editor: Editor;
  pos?: number | null;
}

export function DeleteBlock({ editor, pos }: DeleteBlockProps) {
  const handleClick = () => {
    if (pos === null || pos === undefined) return;

    editor.commands.focus();
    const result = deleteNodeChecked({
      tr: editor.state.tr,
      pos,
      layerAccess: requireLayerMutationAccessForState(editor.state),
    });
    if (result.ok) {
      editor.view.dispatch(result.tr.scrollIntoView());
      return;
    }
  };

  return <MenuIconButton destructive icon={Trash} label="Delete block" onClick={handleClick} />;
}
