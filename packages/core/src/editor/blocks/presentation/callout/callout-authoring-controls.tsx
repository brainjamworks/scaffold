import { IconPicker } from "@/editor/media/authoring/icon-picker/IconPicker";
import { IconRenderer } from "@/ui/icons/IconRenderer";

import type { CalloutIconControlProps } from "./Callout";

export function renderCalloutAuthoringIconControl({
  className,
  fallbackValue,
  onValueChange,
  value,
}: CalloutIconControlProps) {
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
          aria-label="Choose callout icon"
          contentEditable={false}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <IconRenderer
            value={displayValue}
            fallbackValue={fallbackValue}
            className="sc-callout__icon"
          />
        </button>
      )}
    />
  );
}
