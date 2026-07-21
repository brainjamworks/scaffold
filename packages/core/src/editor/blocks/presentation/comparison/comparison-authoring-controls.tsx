import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";

import type { ComparisonAddControlProps } from "./Comparison";

export function renderComparisonAddControl({
  className,
  label,
  onClick,
}: ComparisonAddControlProps) {
  return (
    <BlockAddGhost
      label={label}
      presentation="tile"
      onClick={onClick}
      contentEditable={false}
      className={className}
    />
  );
}
