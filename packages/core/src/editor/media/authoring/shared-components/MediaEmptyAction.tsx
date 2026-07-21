import { ImageIcon as Image } from "@phosphor-icons/react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import "./MediaEmptyAction.css";

export interface MediaEmptyActionProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> {
  "aria-label": string;
  label: string;
}

/** Shared first-image action. Collection additions continue to use BlockAddGhost. */
export const MediaEmptyAction = forwardRef<HTMLButtonElement, MediaEmptyActionProps>(
  function MediaEmptyAction(
    { "aria-label": ariaLabel, className, label, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn("sc-media-empty-action", className)}
        aria-label={ariaLabel}
        {...rest}
      >
        <Image size={24} weight="regular" aria-hidden />
        <span>{label}</span>
      </button>
    );
  },
);
