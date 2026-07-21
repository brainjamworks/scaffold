import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementRef,
} from "react";

import { cn } from "@/lib/cn";

import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";

import "./Tooltip.css";

export const Arrow = TooltipPrimitive.Arrow;
export const Provider = TooltipPrimitive.Provider;
export const Root = TooltipPrimitive.Root;
export const Tooltip = TooltipPrimitive.Tooltip;
export const TooltipArrow = TooltipPrimitive.TooltipArrow;
export const TooltipProvider = TooltipPrimitive.TooltipProvider;
export const TooltipTrigger = TooltipPrimitive.TooltipTrigger;
export const Trigger = TooltipPrimitive.Trigger;
export const createTooltipScope: typeof TooltipPrimitive.createTooltipScope =
  TooltipPrimitive.createTooltipScope;

interface TooltipGeometryStyle extends CSSProperties {
  "--sc-overlay-anchor-block-size": string;
  "--sc-overlay-anchor-inline-size": string;
  "--sc-overlay-available-block-size": string;
  "--sc-overlay-available-inline-size": string;
}

const tooltipGeometryStyle: TooltipGeometryStyle = {
  "--sc-overlay-anchor-block-size": "var(--radix-tooltip-trigger-height)",
  "--sc-overlay-anchor-inline-size": "var(--radix-tooltip-trigger-width)",
  "--sc-overlay-available-block-size": "var(--radix-tooltip-content-available-height)",
  "--sc-overlay-available-inline-size": "var(--radix-tooltip-content-available-width)",
};

export const Content = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, collisionBoundary, style, ...props }, ref) {
  const resolution = useOverlayBoundary();
  const resolvedCollisionBoundary =
    collisionBoundary === undefined && resolution.status === "ready"
      ? resolution.environment.collisionBoundary
      : collisionBoundary;

  return (
    <TooltipPrimitive.Content
      ref={ref}
      className={cn("sc-overlay-positioned-content", "sc-tooltip", className)}
      {...(resolvedCollisionBoundary === undefined
        ? {}
        : { collisionBoundary: resolvedCollisionBoundary })}
      style={{ ...tooltipGeometryStyle, ...style }}
      {...props}
    />
  );
});

export const TooltipContent = Content;

export function Portal(props: TooltipPrimitive.TooltipPortalProps) {
  const resolution = useOverlayBoundary();

  if (resolution.status === "pending") return null;
  if (resolution.status === "unscoped") return <TooltipPrimitive.Portal {...props} />;

  return <TooltipPrimitive.Portal {...props} container={resolution.environment.host} />;
}

export const TooltipPortal = Portal;

export type {
  TooltipArrowProps,
  TooltipContentProps,
  TooltipPortalProps,
  TooltipProps,
  TooltipProviderProps,
  TooltipTriggerProps,
} from "@radix-ui/react-tooltip";
