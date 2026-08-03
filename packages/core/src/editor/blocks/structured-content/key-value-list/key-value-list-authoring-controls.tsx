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
      {label}
    </BlockAddGhost>
  );
}
