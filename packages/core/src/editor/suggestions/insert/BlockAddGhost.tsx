import { PlusIcon as Plus } from "@phosphor-icons/react";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import * as Slot from "@/ui/components/Slot/Slot";
import { cn } from "@/lib/cn";
import { iconSm } from "@/ui/tokens/icon-sizes";

import "./ghost-add.css";

/**
 * `BlockAddGhost` is the block-level counterpart to `LayoutAddGhost`.
 * It owns the semantic primitive (button + plus chip + label) and
 * picks up the visual contract from `.sc-ghost-add`. The host block
 * supplies geometry / placement via `className` and decides what
 * "add" means by passing `onClick`.
 *
 * Don't reach for this for non-add affordances — it's specifically
 * the "+ Add another" gesture (insert a new sibling / item / cell).
 */

export type BlockAddGhostPresentation = "tile" | "pill" | "row" | "item";

/* Hover-color variant. Default = primary. `warning` is reserved for
 * hint affordances (brand semantic: hints are warning-coloured). Any
 * additional tone needs a real product reason. */
export type BlockAddGhostTone = "default" | "warning";

export interface BlockAddGhostProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visible label and aria-label. */
  label: string;
  /** Geometry. Visual rules come from `.sc-ghost-add`. */
  presentation: BlockAddGhostPresentation;
  /** Render into a wrapping component (Popover.Trigger, Tooltip, etc.). */
  asChild?: boolean;
  /** Hover-color variant. Default = primary; warning = hints only. */
  tone?: BlockAddGhostTone;
  /** Override the default plus icon. */
  icon?: ReactNode;
  /** Hide the text label (icon-only). aria-label still comes from `label`. */
  iconOnly?: boolean;
  /** Replace the built-in icon + label rendering. Use when the host
   * block needs additional leading content (e.g. a drag-handle
   * placeholder to align with surrounding rows). */
  children?: ReactNode;
}

export const BlockAddGhost = forwardRef<HTMLButtonElement, BlockAddGhostProps>(
  function BlockAddGhost(
    {
      asChild = false,
      children,
      className,
      icon,
      iconOnly = false,
      label,
      onClick,
      presentation,
      tone = "default",
      ...rest
    },
    ref,
  ) {
    const Component = asChild ? Slot.Slot : "button";

    const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
    };

    return (
      <Component
        ref={ref}
        type={asChild ? undefined : "button"}
        aria-label={label}
        onClick={handleClick}
        className={cn(
          "sc-ghost-add",
          presentation === "row" && "sc-ghost-add--row",
          presentation === "item" && "sc-ghost-add--item",
          tone === "warning" && "sc-ghost-add--tone-warning",
          className,
        )}
        {...rest}
      >
        {children ?? (
          <>
            <span aria-hidden className="sc-ghost-add__icon">
              {icon ?? <Plus size={iconSm} weight="bold" />}
            </span>
            {iconOnly ? null : <span>{label}</span>}
          </>
        )}
      </Component>
    );
  },
);
