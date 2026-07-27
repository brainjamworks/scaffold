import { PlusIcon as Plus } from "@phosphor-icons/react";

import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";

import type { KeyValueListAddControlProps } from "./KeyValueList";

export function renderKeyValueListAddControl({
  className,
  label,
  onClick,
}: KeyValueListAddControlProps) {
  return (
    <BlockAddGhost
      label={label}
      presentation="item"
      onClick={onClick}
      contentEditable={false}
      className={className}
    >
      <span className="sc-key-value-list__add-key">
        <span aria-hidden className="sc-key-value-list__add-marker">
          <Plus size={12} weight="bold" />
        </span>
        Key
      </span>
      <span className="sc-key-value-list__add-value">Value</span>
    </BlockAddGhost>
  );
}
