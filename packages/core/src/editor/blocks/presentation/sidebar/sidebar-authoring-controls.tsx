import { IconPicker } from "@/editor/media/authoring/icon-picker/IconPicker";
import { IconRenderer } from "@/ui/icons/IconRenderer";

import type { SidebarIconControlProps } from "./Sidebar";

export function renderSidebarAuthoringIconControl({
  fallbackValue,
  onValueChange,
  value,
}: SidebarIconControlProps) {
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
          aria-label="Choose sidebar icon"
          contentEditable={false}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          className="sc-sidebar__icon sc-sidebar__icon--interactive"
        >
          <IconRenderer
            value={displayValue}
            fallbackValue={fallbackValue}
            className="sc-sidebar__icon-glyph"
          />
        </button>
      )}
    />
  );
}
