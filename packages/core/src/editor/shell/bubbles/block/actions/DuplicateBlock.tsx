import { CopyIcon as Copy } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";

import { duplicateNodeChecked } from "@/document/model/commands/checked-transactions";
import type { BlockDuplicationLookup } from "@/document/model/identity/clone-with-new-ids";
import { MenuIconButton } from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";

interface DuplicateBlockProps {
  blockDuplications: BlockDuplicationLookup;
  editor: Editor;
  pos?: number | null;
}

/**
 * Stable ids in the clone are regenerated so the duplicate has its own
 * authored identity and nested component references remain coherent.
 */
export function DuplicateBlock({ blockDuplications, editor, pos }: DuplicateBlockProps) {
  const handleClick = () => {
    if (pos === null || pos === undefined) return;

    editor.commands.focus();
    const result = duplicateNodeChecked({
      tr: editor.state.tr,
      pos,
      regenerateNodeIds: true,
      blockDuplications,
    });
    if (result.ok) {
      editor.view.dispatch(result.tr.scrollIntoView());
      return;
    }
  };

  return <MenuIconButton icon={Copy} label="Duplicate block" onClick={handleClick} />;
}
