import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { CheckIcon as Check, MinusIcon as Minus } from "@phosphor-icons/react";
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";

import { cn } from "@/lib/cn";

import "./Checkbox.css";

/**
 * Styled checkbox built on Radix Checkbox. Navy fill when checked,
 * coral on invalid, 1.5px ink border at rest. Supports the
 * indeterminate state (Radix `checked="indeterminate"`).
 *
 * Per `brand/DESIGN-SYSTEM.md`.
 *
 * Pair with the `Label` primitive from `Input.tsx` when you need an
 * accessible label.
 */
interface CheckboxProps extends ComponentPropsWithoutRef<typeof RadixCheckbox.Root> {
  invalid?: boolean;
}

export const Checkbox = forwardRef<ComponentRef<typeof RadixCheckbox.Root>, CheckboxProps>(
  function Checkbox({ className, invalid, ...rest }, ref) {
    return (
      <RadixCheckbox.Root
        ref={ref}
        className={cn("sc-checkbox", className)}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        <RadixCheckbox.Indicator className="sc-checkbox-indicator">
          {rest.checked === "indeterminate" ? (
            <Minus size={11} weight="bold" />
          ) : (
            <Check size={11} weight="bold" />
          )}
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
    );
  },
);
