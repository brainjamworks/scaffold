import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";

import * as Popover from "@/ui/components/Popover/Popover";
import {
  AuthoringChromeKind,
  authoringChromeAttributes,
} from "@/editor/interactions/dom/authoring-chrome";
import { zIndex } from "@/ui/overlays/z-index";

export type EditorFloatingPopoverRootProps = ComponentPropsWithoutRef<typeof Popover.Root>;
export type EditorFloatingPopoverAnchorProps = ComponentPropsWithoutRef<typeof Popover.Anchor>;
export type EditorFloatingPopoverTriggerProps = ComponentPropsWithoutRef<typeof Popover.Trigger>;
export type EditorFloatingPopoverPortalProps = ComponentPropsWithoutRef<typeof Popover.Portal>;
export type EditorFloatingPopoverCloseProps = ComponentPropsWithoutRef<typeof Popover.Close>;
export type EditorFloatingPopoverArrowProps = ComponentPropsWithoutRef<typeof Popover.Arrow>;

export type EditorFloatingAutoFocusEvent = Parameters<
  NonNullable<ComponentPropsWithoutRef<typeof Popover.Content>["onOpenAutoFocus"]>
>[0];
export type EditorFloatingOutsideEvent = Parameters<
  NonNullable<ComponentPropsWithoutRef<typeof Popover.Content>["onInteractOutside"]>
>[0];

export interface EditorFloatingPopoverContentProps extends ComponentPropsWithoutRef<
  typeof Popover.Content
> {
  authoringChrome?: boolean;
}

export const EditorFloatingPopoverRoot = Popover.Root;
export const EditorFloatingPopoverAnchor = Popover.Anchor;
export const EditorFloatingPopoverTrigger = Popover.Trigger;
export const EditorFloatingPopoverPortal = Popover.Portal;
export const EditorFloatingPopoverClose = Popover.Close;
export const EditorFloatingPopoverArrow = Popover.Arrow;

export const EditorFloatingPopoverContent = forwardRef<
  ElementRef<typeof Popover.Content>,
  EditorFloatingPopoverContentProps
>(function EditorFloatingPopoverContent(
  { authoringChrome = false, hideWhenDetached = false, ...props },
  ref,
) {
  const { style, ...contentProps } = props;

  return (
    <Popover.Content
      {...contentProps}
      {...(authoringChrome ? authoringChromeAttributes(AuthoringChromeKind.Popover) : {})}
      hideWhenDetached={hideWhenDetached}
      ref={ref}
      style={{ zIndex: zIndex.popover, ...style }}
    />
  );
});

export const EditorFloatingPopover = {
  Anchor: EditorFloatingPopoverAnchor,
  Arrow: EditorFloatingPopoverArrow,
  Close: EditorFloatingPopoverClose,
  Content: EditorFloatingPopoverContent,
  Portal: EditorFloatingPopoverPortal,
  Root: EditorFloatingPopoverRoot,
  Trigger: EditorFloatingPopoverTrigger,
} as const;
