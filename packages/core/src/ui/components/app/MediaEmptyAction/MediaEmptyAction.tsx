import { ImageIcon as Image } from "@phosphor-icons/react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import "./MediaEmptyAction.css";

export interface MediaEmptyActionProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> {
  "aria-label": string;
  icon?: ReactNode;
  label: string;
}

/** App-owned first-media action. Collection additions continue to use BlockAddGhost. */
export const MediaEmptyAction = forwardRef<HTMLButtonElement, MediaEmptyActionProps>(
  function MediaEmptyAction(
    {
      "aria-label": ariaLabel,
      className,
      icon = <Image size={24} weight="regular" />,
      label,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn("sc-app-media-empty-action", className)}
        aria-label={ariaLabel}
        {...rest}
      >
        <span className="sc-app-media-empty-action__icon" aria-hidden>
          {icon}
        </span>
        <span>{label}</span>
      </button>
    );
  },
);
