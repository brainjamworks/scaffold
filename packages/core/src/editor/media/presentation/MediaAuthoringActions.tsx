import { PlusIcon as Plus } from "@phosphor-icons/react";
import type { MouseEvent, PointerEvent, ReactNode } from "react";

import { MediaReplaceButton } from "@/editor/media/authoring/shared-components/MediaReplaceButton";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import { iconSm } from "@/ui/tokens/icon-sizes";
import { zIndex } from "@/ui/overlays/z-index";

import "./MediaOverlayButton.css";
import "./MediaExpandButton.css";

export interface MediaAuthoringActionsProps {
  addLabel: string;
  ariaLabel: string;
  editAction: ReactNode;
  hidden?: boolean;
  onAdd: () => void;
  onReplace: () => void;
}

/** Shared compact authoring actions that sit directly over an image. */
export function MediaAuthoringActions({
  addLabel,
  ariaLabel,
  editAction,
  hidden = false,
  onAdd,
  onReplace,
}: MediaAuthoringActionsProps) {
  if (hidden) return null;

  return (
    <Tooltip.Provider delayDuration={350}>
      <div
        className="sc-media-authoring-actions"
        role="toolbar"
        aria-label={ariaLabel}
        contentEditable={false}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <MediaReplaceButton aria-label="Replace image" onClick={onReplace} />
        <MediaAuthoringAction label={addLabel} onClick={onAdd}>
          <Plus size={iconSm} weight="bold" aria-hidden />
        </MediaAuthoringAction>
        {editAction}
      </div>
    </Tooltip.Provider>
  );
}

function MediaAuthoringAction({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClick();
  };
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label={label}
          className="sc-media-overlay-button"
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          size="md"
          variant="ghost"
        >
          {children}
        </IconButton>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="top" sideOffset={8} style={{ zIndex: zIndex.tooltip }}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
