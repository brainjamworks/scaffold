import { inputVariants } from "@/ui/components/Input/Input";
import { cn } from "@/lib/cn";

import {
  NestedRichTextEditorField,
  type NestedRichTextEditorFieldProps,
} from "./NestedRichTextEditorField";

import "./RichTextArea.css";

export interface RichTextAreaProps extends Omit<
  NestedRichTextEditorFieldProps,
  "ariaMultiline" | "className" | "mountClassName"
> {
  /** Adds classes to the editable form control. */
  className?: string;
}

/** Form-textarea presentation over the shared nested-editor behavior seam. */
export function RichTextArea({ className, ...props }: RichTextAreaProps) {
  return (
    <NestedRichTextEditorField
      {...props}
      ariaMultiline
      className={cn(inputVariants(), "sc-textarea", "sc-rich-text-area", className)}
      mountClassName="sc-rich-text-area__mount"
    />
  );
}
