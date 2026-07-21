import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/cn";
import "./Pill.css";

export type PillVariant = "neutral" | "ink" | "navy" | "success" | "warning" | "error" | "info";

export type PillSize = "sm" | "md";
export type PillTextCase = "normal" | "upper";

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: PillVariant;
  size?: PillSize;
  tabular?: boolean;
  case?: PillTextCase;
}

export const Pill = forwardRef<HTMLSpanElement, PillProps>(function Pill(
  {
    className,
    variant = "neutral",
    size = "md",
    tabular = false,
    case: textCase = "normal",
    ...rest
  },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn("sc-pill", className)}
      data-case={textCase}
      data-size={size}
      data-tabular={tabular ? "true" : undefined}
      data-variant={variant}
      {...rest}
    />
  );
});
