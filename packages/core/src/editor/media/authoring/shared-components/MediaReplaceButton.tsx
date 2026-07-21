import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import { iconSm } from "@/ui/tokens/icon-sizes";
import { zIndex } from "@/ui/overlays/z-index";

import "../../presentation/MediaOverlayButton.css";
import "./MediaReplaceButton.css";

export interface MediaReplaceButtonProps extends Omit<
  ComponentPropsWithoutRef<typeof IconButton>,
  "children"
> {
  "aria-label": string;
}

/** Shared authoring overlay for replacing an existing image. */
export const MediaReplaceButton = forwardRef<HTMLButtonElement, MediaReplaceButtonProps>(
  function MediaReplaceButton(
    { "aria-label": ariaLabel, className, size = "md", variant = "ghost", ...props },
    ref,
  ) {
    return (
      <Tooltip.Provider delayDuration={350}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <IconButton
              {...props}
              ref={ref}
              aria-label={ariaLabel}
              className={cn("sc-media-overlay-button", "sc-media-replace-button", className)}
              size={size}
              variant={variant}
            >
              <ArrowsClockwise size={iconSm} weight="bold" aria-hidden />
            </IconButton>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content side="top" sideOffset={8} style={{ zIndex: zIndex.tooltip }}>
              Replace image
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  },
);
