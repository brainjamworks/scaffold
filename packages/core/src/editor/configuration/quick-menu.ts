import type { Icon } from "@phosphor-icons/react";
import type { FieldPath, FieldValues } from "react-hook-form";
import type { ZodTypeAny } from "zod";

export type QuickMenuAttrSurface = "data" | "settings" | "options";

export interface QuickMenuSelectOption {
  value: string;
  label: string;
  icon?: Icon;
}

/** Registry-time quick-menu control after placement and sheet-only fields are consumed. */
export type QuickControlDescriptor =
  | {
      kind: "boolean";
      name: FieldPath<FieldValues>;
      label: string;
      icon?: Icon;
      presentation?: "icon-toggle";
    }
  | {
      kind: "select";
      name: FieldPath<FieldValues>;
      label: string;
      options?: readonly QuickMenuSelectOption[];
      presentation?: "menu" | "segmented";
    }
  | {
      kind: "number";
      name: FieldPath<FieldValues>;
      label: string;
      min?: number;
      max?: number;
      step?: number;
    }
  | {
      kind: "color";
      name: FieldPath<FieldValues>;
      label: string;
      pickerLabel?: string;
      labelSuffix?: string;
      resetLabel?: string;
      resetAriaLabel?: string;
      customHint?: string;
    };

export interface QuickMenuDefinition {
  attr: QuickMenuAttrSurface;
  schema: ZodTypeAny;
  controls: readonly QuickControlDescriptor[];
}

export function getQuickControlDescriptorId(control: QuickControlDescriptor): string {
  return `name:${control.name}`;
}
