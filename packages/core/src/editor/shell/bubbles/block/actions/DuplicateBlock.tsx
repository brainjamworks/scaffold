import { CopyIcon as Copy } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";

import { requireLayerMutationAccessForState } from "@/document/authoring/layers/layer-editing-boundaries";
import { duplicateNodeChecked } from "@/document/model/commands/checked-transactions";
import type { ContentIdentityRewriteLookup } from "@/document/model/identity/clone-with-new-ids";
import { MenuIconButton } from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";

interface DuplicateBlockProps {
  identityRewrites: ContentIdentityRewriteLookup;
  editor: Editor;
  pos?: number | null;
}

/**
 * Stable ids in the clone are regenerated so the duplicate has its own
 * authored identity and nested component references remain coherent.
 */
export function DuplicateBlock({ identityRewrites, editor, pos }: DuplicateBlockProps) {
  const handleClick = () => {
    if (pos === null || pos === undefined) return;

    editor.commands.focus();
    const result = duplicateNodeChecked({
      tr: editor.state.tr,
      pos,
      regenerateNodeIds: true,
      identityRewrites,
      layerAccess: requireLayerMutationAccessForState(editor.state),
    });
    if (result.ok) {
      editor.view.dispatch(result.tr.scrollIntoView());
      return;
    }
  };

  return <MenuIconButton icon={Copy} label="Duplicate block" onClick={handleClick} />;
}
