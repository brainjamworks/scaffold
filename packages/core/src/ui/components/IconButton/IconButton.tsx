import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import "./IconButton.css";

/**
 * Icon-only button. The chrome counterpart to `Button`: same
 * vocabulary (pill-shaped, brand-token colours, focus ring) but sized
 * for a single glyph. Reach for `IconButton` whenever the affordance
 * is a `<button>` carrying just an icon + `aria-label`. Inline custom
 * `inline-flex ... rounded-full` classes are a tell that this
 * primitive wasn't used.
 */
export type IconButtonVariant = "ghost" | "inline" | "primary" | "danger";
export type IconButtonSize = "sm" | "md" | "lg";

interface IconButtonVariantProps {
  variant?: IconButtonVariant | null;
  size?: IconButtonSize | null;
}

export function iconButtonVariants(_options?: IconButtonVariantProps): string {
  return "sc-icon-button";
}

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, IconButtonVariantProps {}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant = "ghost", size = "md", type, ...rest },
  ref,
) {
  const resolvedVariant = variant ?? "ghost";
  const resolvedSize = size ?? "md";

  return (
    <button
      ref={ref}
      className={cn(iconButtonVariants(), className)}
      data-size={resolvedSize}
      data-variant={resolvedVariant}
      type={type ?? "button"}
      {...rest}
    />
  );
});
