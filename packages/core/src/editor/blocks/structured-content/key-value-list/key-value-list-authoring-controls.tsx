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
      <span className="sc-key-value-list__add-key">Key</span>
      <span className="sc-key-value-list__add-value">Value</span>
    </BlockAddGhost>
  );
}
