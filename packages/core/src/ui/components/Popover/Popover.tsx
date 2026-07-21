import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementRef,
} from "react";

import { cn } from "@/lib/cn";

import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";

export const Root = PopoverPrimitive.Root;
export const Trigger = PopoverPrimitive.Trigger;
export const Anchor = PopoverPrimitive.Anchor;
export const Arrow = PopoverPrimitive.Arrow;
export const Close = PopoverPrimitive.Close;

export function Portal(props: PopoverPrimitive.PopoverPortalProps) {
  const resolution = useOverlayBoundary();

  if (resolution.status === "pending") return null;
  if (resolution.status === "unscoped") return <PopoverPrimitive.Portal {...props} />;

  return <PopoverPrimitive.Portal {...props} container={resolution.environment.host} />;
}

interface PopoverGeometryStyle extends CSSProperties {
  "--sc-overlay-anchor-block-size": string;
  "--sc-overlay-anchor-inline-size": string;
  "--sc-overlay-available-block-size": string;
  "--sc-overlay-available-inline-size": string;
}

const popoverGeometryStyle: PopoverGeometryStyle = {
  "--sc-overlay-anchor-block-size": "var(--radix-popover-trigger-height)",
  "--sc-overlay-anchor-inline-size": "var(--radix-popover-trigger-width)",
  "--sc-overlay-available-block-size": "var(--radix-popover-content-available-height)",
  "--sc-overlay-available-inline-size": "var(--radix-popover-content-available-width)",
};

export const Content = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent(
  {
    className,
    collisionBoundary,
    hideWhenDetached = true,
    style,
    updatePositionStrategy = "always",
    ...props
  },
  ref,
) {
  const resolution = useOverlayBoundary();
  const resolvedCollisionBoundary =
    collisionBoundary === undefined && resolution.status === "ready"
      ? resolution.environment.collisionBoundary
      : collisionBoundary;

  return (
    <PopoverPrimitive.Content
      ref={ref}
      className={cn("sc-overlay-positioned-content", className)}
      {...(resolvedCollisionBoundary === undefined
        ? {}
        : { collisionBoundary: resolvedCollisionBoundary })}
      hideWhenDetached={hideWhenDetached}
      style={{ ...popoverGeometryStyle, ...style }}
      updatePositionStrategy={updatePositionStrategy}
      {...props}
    />
  );
});
