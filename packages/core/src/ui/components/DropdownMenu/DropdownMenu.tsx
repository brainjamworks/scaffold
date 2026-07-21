import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementRef,
} from "react";

import { cn } from "@/lib/cn";

import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";

export const Arrow = DropdownMenuPrimitive.Arrow;
export const CheckboxItem = DropdownMenuPrimitive.CheckboxItem;
export const DropdownMenu = DropdownMenuPrimitive.DropdownMenu;
export const DropdownMenuArrow = DropdownMenuPrimitive.DropdownMenuArrow;
export const DropdownMenuCheckboxItem = DropdownMenuPrimitive.DropdownMenuCheckboxItem;
export const DropdownMenuGroup = DropdownMenuPrimitive.DropdownMenuGroup;
export const DropdownMenuItem = DropdownMenuPrimitive.DropdownMenuItem;
export const DropdownMenuItemIndicator = DropdownMenuPrimitive.DropdownMenuItemIndicator;
export const DropdownMenuLabel = DropdownMenuPrimitive.DropdownMenuLabel;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.DropdownMenuRadioGroup;
export const DropdownMenuRadioItem = DropdownMenuPrimitive.DropdownMenuRadioItem;
export const DropdownMenuSeparator = DropdownMenuPrimitive.DropdownMenuSeparator;
export const DropdownMenuSub = DropdownMenuPrimitive.DropdownMenuSub;
export const DropdownMenuSubTrigger = DropdownMenuPrimitive.DropdownMenuSubTrigger;
export const DropdownMenuTrigger = DropdownMenuPrimitive.DropdownMenuTrigger;
export const Group = DropdownMenuPrimitive.Group;
export const Item = DropdownMenuPrimitive.Item;
export const ItemIndicator = DropdownMenuPrimitive.ItemIndicator;
export const Label = DropdownMenuPrimitive.Label;
export const RadioGroup = DropdownMenuPrimitive.RadioGroup;
export const RadioItem = DropdownMenuPrimitive.RadioItem;
export const Root = DropdownMenuPrimitive.Root;
export const Separator = DropdownMenuPrimitive.Separator;
export const Sub = DropdownMenuPrimitive.Sub;
export const SubTrigger = DropdownMenuPrimitive.SubTrigger;
export const Trigger = DropdownMenuPrimitive.Trigger;
export const createDropdownMenuScope: typeof DropdownMenuPrimitive.createDropdownMenuScope =
  DropdownMenuPrimitive.createDropdownMenuScope;

interface DropdownMenuGeometryStyle extends CSSProperties {
  "--sc-overlay-anchor-block-size": string;
  "--sc-overlay-anchor-inline-size": string;
  "--sc-overlay-available-block-size": string;
  "--sc-overlay-available-inline-size": string;
}

const dropdownMenuGeometryStyle: DropdownMenuGeometryStyle = {
  "--sc-overlay-anchor-block-size": "var(--radix-dropdown-menu-trigger-height)",
  "--sc-overlay-anchor-inline-size": "var(--radix-dropdown-menu-trigger-width)",
  "--sc-overlay-available-block-size": "var(--radix-dropdown-menu-content-available-height)",
  "--sc-overlay-available-inline-size": "var(--radix-dropdown-menu-content-available-width)",
};

export const Content = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className, collisionBoundary, style, ...props }, ref) {
  const resolution = useOverlayBoundary();
  const resolvedCollisionBoundary =
    collisionBoundary === undefined && resolution.status === "ready"
      ? resolution.environment.collisionBoundary
      : collisionBoundary;

  return (
    <DropdownMenuPrimitive.Content
      ref={ref}
      className={cn("sc-overlay-positioned-content", className)}
      {...(resolvedCollisionBoundary === undefined
        ? {}
        : { collisionBoundary: resolvedCollisionBoundary })}
      style={{ ...dropdownMenuGeometryStyle, ...style }}
      {...props}
    />
  );
});

export const DropdownMenuContent = Content;

export const SubContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(function DropdownMenuSubContent({ className, collisionBoundary, style, ...props }, ref) {
  const resolution = useOverlayBoundary();
  const resolvedCollisionBoundary =
    collisionBoundary === undefined && resolution.status === "ready"
      ? resolution.environment.collisionBoundary
      : collisionBoundary;

  return (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      className={cn("sc-overlay-positioned-content", className)}
      {...(resolvedCollisionBoundary === undefined
        ? {}
        : { collisionBoundary: resolvedCollisionBoundary })}
      style={{ ...dropdownMenuGeometryStyle, ...style }}
      {...props}
    />
  );
});

export const DropdownMenuSubContent = SubContent;

export function Portal(props: DropdownMenuPrimitive.DropdownMenuPortalProps) {
  const resolution = useOverlayBoundary();

  if (resolution.status === "pending") return null;
  if (resolution.status === "unscoped") return <DropdownMenuPrimitive.Portal {...props} />;

  return <DropdownMenuPrimitive.Portal {...props} container={resolution.environment.host} />;
}

export const DropdownMenuPortal = Portal;

export type {
  DropdownMenuArrowProps,
  DropdownMenuCheckboxItemProps,
  DropdownMenuContentProps,
  DropdownMenuGroupProps,
  DropdownMenuItemIndicatorProps,
  DropdownMenuItemProps,
  DropdownMenuLabelProps,
  DropdownMenuPortalProps,
  DropdownMenuProps,
  DropdownMenuRadioGroupProps,
  DropdownMenuRadioItemProps,
  DropdownMenuSeparatorProps,
  DropdownMenuSubContentProps,
  DropdownMenuSubProps,
  DropdownMenuSubTriggerProps,
  DropdownMenuTriggerProps,
} from "@radix-ui/react-dropdown-menu";
