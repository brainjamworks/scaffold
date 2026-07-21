import * as SelectPrimitive from "@radix-ui/react-select";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementRef,
} from "react";

import { cn } from "@/lib/cn";

import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";

export const Arrow = SelectPrimitive.Arrow;
export const Group = SelectPrimitive.Group;
export const Icon = SelectPrimitive.Icon;
export const Item = SelectPrimitive.Item;
export const ItemIndicator = SelectPrimitive.ItemIndicator;
export const ItemText = SelectPrimitive.ItemText;
export const Label = SelectPrimitive.Label;
export const Root = SelectPrimitive.Root;
export const ScrollDownButton = SelectPrimitive.ScrollDownButton;
export const ScrollUpButton = SelectPrimitive.ScrollUpButton;
export const Select = SelectPrimitive.Select;
export const SelectArrow = SelectPrimitive.SelectArrow;
export const SelectGroup = SelectPrimitive.SelectGroup;
export const SelectIcon = SelectPrimitive.SelectIcon;
export const SelectItem = SelectPrimitive.SelectItem;
export const SelectItemIndicator = SelectPrimitive.SelectItemIndicator;
export const SelectItemText = SelectPrimitive.SelectItemText;
export const SelectLabel = SelectPrimitive.SelectLabel;
export const SelectScrollDownButton = SelectPrimitive.SelectScrollDownButton;
export const SelectScrollUpButton = SelectPrimitive.SelectScrollUpButton;
export const SelectSeparator = SelectPrimitive.SelectSeparator;
export const SelectTrigger = SelectPrimitive.SelectTrigger;
export const SelectValue = SelectPrimitive.SelectValue;
export const SelectViewport = SelectPrimitive.SelectViewport;
export const Separator = SelectPrimitive.Separator;
export const Trigger = SelectPrimitive.Trigger;
export const Value = SelectPrimitive.Value;
export const Viewport = SelectPrimitive.Viewport;
export const createSelectScope: typeof SelectPrimitive.createSelectScope =
  SelectPrimitive.createSelectScope;
export const unstable_BubbleInput = SelectPrimitive.unstable_BubbleInput;
export const unstable_Provider = SelectPrimitive.unstable_Provider;
export const unstable_SelectBubbleInput = SelectPrimitive.unstable_SelectBubbleInput;
export const unstable_SelectProvider = SelectPrimitive.unstable_SelectProvider;

interface SelectGeometryStyle extends CSSProperties {
  "--sc-overlay-anchor-block-size": string;
  "--sc-overlay-anchor-inline-size": string;
  "--sc-overlay-available-block-size": string;
  "--sc-overlay-available-inline-size": string;
}

const selectGeometryStyle: SelectGeometryStyle = {
  "--sc-overlay-anchor-block-size": "var(--radix-select-trigger-height)",
  "--sc-overlay-anchor-inline-size": "var(--radix-select-trigger-width)",
  "--sc-overlay-available-block-size": "var(--radix-select-content-available-height)",
  "--sc-overlay-available-inline-size": "var(--radix-select-content-available-width)",
};

export const Content = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent(
  { className, collisionBoundary, position = "popper", style, ...props },
  ref,
) {
  const resolution = useOverlayBoundary();
  const resolvedCollisionBoundary =
    collisionBoundary === undefined && resolution.status === "ready"
      ? resolution.environment.collisionBoundary
      : collisionBoundary;

  return (
    <SelectPrimitive.Content
      ref={ref}
      className={cn(position === "popper" && "sc-overlay-positioned-content", className)}
      {...(resolvedCollisionBoundary === undefined
        ? {}
        : { collisionBoundary: resolvedCollisionBoundary })}
      position={position}
      style={{ ...selectGeometryStyle, ...style }}
      {...props}
    />
  );
});

export const SelectContent = Content;

export function Portal(props: SelectPrimitive.SelectPortalProps) {
  const resolution = useOverlayBoundary();

  if (resolution.status === "pending") return null;
  if (resolution.status === "unscoped") return <SelectPrimitive.Portal {...props} />;

  return <SelectPrimitive.Portal {...props} container={resolution.environment.host} />;
}

export const SelectPortal = Portal;

export type {
  SelectArrowProps,
  SelectContentProps,
  SelectGroupProps,
  SelectIconProps,
  SelectItemIndicatorProps,
  SelectItemProps,
  SelectItemTextProps,
  SelectLabelProps,
  SelectPortalProps,
  SelectProps,
  SelectScrollDownButtonProps,
  SelectScrollUpButtonProps,
  SelectSeparatorProps,
  SelectSharedProps,
  SelectTriggerProps,
  SelectValueProps,
  SelectViewportProps,
  unstable_SelectBubbleInputProps,
  unstable_SelectProviderProps,
} from "@radix-ui/react-select";
