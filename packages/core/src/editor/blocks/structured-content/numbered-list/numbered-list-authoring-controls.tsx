import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";
import { IconPicker } from "@/editor/media/authoring/icon-picker/IconPicker";
import { IconRenderer } from "@/ui/icons/IconRenderer";

import type { NumberedListAddControlProps, NumberedListIconControlProps } from "./NumberedList";

export function renderNumberedListAddControl({
  className,
  label,
  onClick,
}: NumberedListAddControlProps) {
  return (
    <BlockAddGhost
      label={label}
      presentation="row"
      onClick={onClick}
      contentEditable={false}
      className={className}
    />
  );
}

export function renderNumberedListIconControl({
  className,
  fallbackValue,
  onValueChange,
  value,
}: NumberedListIconControlProps) {
  return (
    <IconPicker
      value={value}
      fallbackValue={fallbackValue}
      align="start"
      side="bottom"
      onValueChange={onValueChange}
      renderTrigger={({ displayValue }) => (
        <button
          type="button"
          className={className}
          aria-label="Choose numbered list icon"
          contentEditable={false}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <IconRenderer
            value={displayValue}
            fallbackValue={fallbackValue}
            className="sc-numbered-list__header-icon-glyph"
          />
        </button>
      )}
    />
  );
}
