import * as RadixSwitch from "@radix-ui/react-switch";
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";

import { cn } from "@/lib/cn";

import "./Switch.css";

/**
 * Styled toggle switch built on Radix Switch. Off = muted track, on =
 * navy track. The thumb is always white. Pair with the `Label`
 * primitive from `Input.tsx` for an accessible label.
 *
 * Per `brand/DESIGN-SYSTEM.md`.
 */
export const Switch = forwardRef<
  ComponentRef<typeof RadixSwitch.Root>,
  ComponentPropsWithoutRef<typeof RadixSwitch.Root>
>(function Switch({ className, ...rest }, ref) {
  return (
    <RadixSwitch.Root ref={ref} className={cn("sc-switch", className)} {...rest}>
      <RadixSwitch.Thumb className="sc-switch-thumb" />
    </RadixSwitch.Root>
  );
});
