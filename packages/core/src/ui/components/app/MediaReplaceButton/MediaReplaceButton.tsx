import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@radix-ui/themes";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";
import { iconSm } from "@/ui/tokens/icon-sizes";

import "./MediaReplaceButton.css";

export interface MediaReplaceButtonProps extends Omit<
  ComponentPropsWithoutRef<typeof IconButton>,
  "children"
> {
  "aria-label": string;
  placement?: "inline" | "overlay";
  tooltip?: string;
}

/** App-owned authoring control for replacing existing media. */
export const MediaReplaceButton = forwardRef<HTMLButtonElement, MediaReplaceButtonProps>(
  function MediaReplaceButton(
    {
      "aria-label": ariaLabel,
      className,
      placement = "overlay",
      radius = "full",
      size = "2",
      tooltip = "Replace image",
      type = "button",
      variant = "surface",
      ...props
    },
    ref,
  ) {
    return (
      <Tooltip
        className="sc-app-media-replace-tooltip"
        content={tooltip}
        delayDuration={350}
        side="top"
        sideOffset={8}
        style={{ zIndex: zIndex.tooltip }}
      >
        <IconButton
          {...props}
          ref={ref}
          aria-label={ariaLabel}
          className={cn("sc-app-media-replace-button", className)}
          data-placement={placement}
          radius={radius}
          size={size}
          type={type}
          variant={variant}
        >
          <ArrowsClockwise size={iconSm} weight="bold" aria-hidden />
        </IconButton>
      </Tooltip>
    );
  },
);
