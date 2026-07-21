import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import "./Card.css";

/**
 * Flat hairline-bordered card on canvas. No shadow at rest. Hover
 * darkens the border to ink for interactive cards — no shadow lift,
 * per `brand/DESIGN-SYSTEM.md`.
 *
 *  - default     1px gray border, no interactivity
 *  - selected    2px navy border, used when a single card is the
 *                current selection in a list
 *  - interactive default chrome + border-on-hover transition, used
 *                when the whole card is clickable
 */
export type CardVariant = "default" | "selected" | "interactive";
export type CardPadding = "none" | "sm" | "md" | "lg";

interface CardVariantProps {
  variant?: CardVariant | null;
  padding?: CardPadding | null;
}

function cardVariants(_options?: CardVariantProps): string {
  return "sc-card";
}

export interface CardProps extends HTMLAttributes<HTMLDivElement>, CardVariantProps {}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = "default", padding = "md", ...rest },
  ref,
) {
  const resolvedVariant = variant ?? "default";
  const resolvedPadding = padding ?? "md";

  return (
    <div
      ref={ref}
      className={cn(
        cardVariants({ variant: resolvedVariant, padding: resolvedPadding }),
        className,
      )}
      data-padding={resolvedPadding}
      data-variant={resolvedVariant}
      {...rest}
    />
  );
});

/** Optional sub-parts for consistent card composition. */

export function CardLabel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sc-card-label", className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("sc-card-title", className)} {...rest} />;
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sc-card-body", className)} {...rest} />;
}

export { cardVariants };
