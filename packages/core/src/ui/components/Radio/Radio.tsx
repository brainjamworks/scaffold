import * as RadixRadio from "@radix-ui/react-radio-group";
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";

import { cn } from "@/lib/cn";

import "./Radio.css";

/**
 * Styled radio group built on Radix RadioGroup. 1.5px ink border at
 * rest, navy fill + white dot when selected. Pair with the `Label`
 * primitive from `Input.tsx`.
 *
 * Per `brand/DESIGN-SYSTEM.md`.
 *
 * Usage:
 *
 *     <RadioGroup value={v} onValueChange={setV}>
 *       <RadioItem value="a" id="a" />
 *       <RadioItem value="b" id="b" />
 *     </RadioGroup>
 */

export const RadioGroup = forwardRef<
  ComponentRef<typeof RadixRadio.Root>,
  ComponentPropsWithoutRef<typeof RadixRadio.Root>
>(function RadioGroup({ className, ...rest }, ref) {
  return <RadixRadio.Root ref={ref} className={cn("sc-radio-group", className)} {...rest} />;
});

export const RadioItem = forwardRef<
  ComponentRef<typeof RadixRadio.Item>,
  ComponentPropsWithoutRef<typeof RadixRadio.Item>
>(function RadioItem({ className, ...rest }, ref) {
  return (
    <RadixRadio.Item ref={ref} className={cn("sc-radio-item", className)} {...rest}>
      <RadixRadio.Indicator className="sc-radio-indicator" />
    </RadixRadio.Item>
  );
});
