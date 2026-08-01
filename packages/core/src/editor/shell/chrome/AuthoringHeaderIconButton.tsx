import { forwardRef, type ReactNode } from "react";

import { IconButton, type IconButtonProps } from "@/ui/components/IconButton/IconButton";
import * as Tooltip from "@/ui/components/Tooltip/Tooltip";

export interface AuthoringHeaderIconButtonProps extends Omit<
  IconButtonProps,
  "aria-label" | "children"
> {
  "aria-label": string;
  children: ReactNode;
  tooltip: string;
}

/** Circular, tooltip-backed action for Scaffold and host-provided authoring header controls. */
export const AuthoringHeaderIconButton = forwardRef<
  HTMLButtonElement,
  AuthoringHeaderIconButtonProps
>(function AuthoringHeaderIconButton(
  { children, size = "lg", tooltip, variant = "ghost", ...buttonProps },
  ref,
) {
  return (
    <Tooltip.Provider delayDuration={350}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <IconButton ref={ref} size={size} variant={variant} {...buttonProps}>
            {children}
          </IconButton>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="bottom" sideOffset={8}>
            {tooltip}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
});
