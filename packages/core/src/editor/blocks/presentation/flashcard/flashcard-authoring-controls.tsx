import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";

import type { FlashcardAddControlProps } from "./flashcard-authoring-view";

export function renderFlashcardAddControl({ className, label, onClick }: FlashcardAddControlProps) {
  return (
    <BlockAddGhost
      contentEditable={false}
      label={label}
      presentation="tile"
      onClick={onClick}
      className={className}
    />
  );
}
