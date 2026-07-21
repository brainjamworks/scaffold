import {
  ArrowsOutSimpleIcon as ArrowsOutSimple,
  PencilSimpleIcon as PencilSimple,
} from "@phosphor-icons/react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { cn } from "@/lib/cn";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import { zIndex } from "@/ui/overlays/z-index";

import "./MediaOverlayButton.css";
import "./MediaExpandButton.css";

export interface MediaExpandButtonProps extends Omit<
  ComponentPropsWithoutRef<typeof IconButton>,
  "children"
> {
  "aria-label": string;
  glyph?: "edit" | "expand";
  tooltipLabel: string;
  hidden?: boolean;
}

/** Presentation-only expand affordance for consumer-owned media overlays. */
export const MediaExpandButton = forwardRef<HTMLButtonElement, MediaExpandButtonProps>(
  function MediaExpandButton(
    {
      "aria-label": ariaLabel,
      className,
      glyph = "expand",
      hidden = false,
      onClick,
      onPointerDown,
      size = "md",
      tooltipLabel,
      variant = "ghost",
      ...props
    },
    ref,
  ) {
    if (hidden) return null;

    const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onPointerDown?.(event);
    };
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onClick?.(event);
    };

    return (
      <Tooltip.Provider delayDuration={350}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <IconButton
              {...props}
              ref={ref}
              aria-label={ariaLabel}
              className={cn("sc-media-overlay-button", "sc-media-expand-button", className)}
              onClick={handleClick}
              onPointerDown={handlePointerDown}
              size={size}
              variant={variant}
            >
              {glyph === "edit" ? (
                <PencilSimple size={14} weight="bold" aria-hidden />
              ) : (
                <ArrowsOutSimple size={14} weight="bold" aria-hidden />
              )}
            </IconButton>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content side="top" sideOffset={8} style={{ zIndex: zIndex.tooltip }}>
              {tooltipLabel}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  },
);
