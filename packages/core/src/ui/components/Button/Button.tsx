import { Slot } from "@radix-ui/react-slot";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import "./Button.css";

/**
 * The single Button primitive. Five variants × three sizes. Pill-shaped
 * always (per `brand/DESIGN-SYSTEM.md` — pill is the rebrand's distinctive
 * component move). Use `asChild` to
 * morph into a Link or other interactive element while keeping the
 * Button's styles.
 *
 *  - primary   navy fill / white text         — one per surface
 *  - secondary white fill / ink border        — outlined, low emphasis
 *  - ghost     transparent / hover muted      — chrome buttons
 *  - danger    coral fill / white text        — destructive only
 *  - success   teal fill / white text         — completion / save-confirm
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

export type ButtonSize = "sm" | "md" | "lg";

export function buttonVariants(_options?: ButtonVariantProps): string {
  return "sc-button";
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariantProps {
  /**
   * Render as the child element instead of a `<button>`. Used to morph
   * the Button into a Link or another interactive element while keeping
   * the Button styles. Standard Radix Slot pattern.
   */
  asChild?: boolean;
}

interface ButtonVariantProps {
  variant?: ButtonVariant | null;
  size?: ButtonSize | null;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", asChild = false, type, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  const resolvedVariant = variant ?? "primary";
  const resolvedSize = size ?? "md";

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants(), className)}
      data-size={resolvedSize}
      data-variant={resolvedVariant}
      // Default `type="button"` so the Button never submits a form by
      // accident. Consumers can override with `type="submit"`.
      {...(asChild ? {} : { type: type ?? "button" })}
      {...rest}
    />
  );
});
