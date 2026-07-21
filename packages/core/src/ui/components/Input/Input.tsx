import {
  forwardRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

import "./Input.css";

/**
 * Form input + textarea primitives.
 *
 * 8px radius, 1px gray-300 border at rest, navy ring on focus, coral
 * on error. Same styling on light + dark surfaces (consumer chooses
 * background via wrapping). Per `brand/DESIGN-SYSTEM.md`.
 */
export interface InputVariantProps {
  invalid?: boolean | null | undefined;
}

export function inputVariants(_options?: InputVariantProps): string {
  return "sc-input";
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">, InputVariantProps {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, type = "text", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(inputVariants({ invalid }), className)}
      aria-invalid={invalid || undefined}
      data-invalid={invalid ? "true" : undefined}
      {...rest}
    />
  );
});

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>, InputVariantProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(inputVariants({ invalid }), "sc-textarea", className)}
      aria-invalid={invalid || undefined}
      data-invalid={invalid ? "true" : undefined}
      {...rest}
    />
  );
});

/**
 * Form field label. Sentence-case, semibold, 12px ink — weight + ink
 * carry hierarchy at a small size without resorting to all-caps
 * tracked treatments.
 */
export function Label({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("sc-field-label", className)} {...rest} />;
}

/** Vertical stack of Label + Input + (optional) HelpText / FieldError. */
export function Field({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sc-field", className)} {...rest} />;
}

/** Subtle helper text under an input. */
export function HelpText({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("sc-field-help", className)} {...rest} />;
}

/** Error text under an invalid input. Pairs with `invalid` on the Input. */
export function FieldError({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("sc-field-error", className)} role="alert" {...rest} />;
}
