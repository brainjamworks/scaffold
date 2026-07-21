import type { Icon } from "@phosphor-icons/react";
import type { FieldPath, FieldValues } from "react-hook-form";

export type MenuFieldName = FieldPath<FieldValues>;

export interface MenuSelectOption {
  value: string;
  label: string;
  icon?: Icon;
  disabled?: boolean;
}

/** Render-time menu control data consumed directly by MenuControls. */
export type MenuControlDescriptor =
  | {
      kind: "boolean";
      name: MenuFieldName;
      label: string;
      icon?: Icon;
      presentation?: "icon-toggle";
    }
  | {
      kind: "select";
      name: MenuFieldName;
      label: string;
      options?: readonly MenuSelectOption[];
      presentation?: "menu" | "segmented";
    }
  | {
      kind: "number";
      name: MenuFieldName;
      label: string;
      min?: number;
      max?: number;
      step?: number;
    }
  | {
      kind: "color";
      name: MenuFieldName;
      label: string;
      pickerLabel?: string;
      labelSuffix?: string;
      resetLabel?: string;
      resetAriaLabel?: string;
      customHint?: string;
    }
  | {
      kind: "action";
      id: string;
      label: string;
      icon?: Icon;
      destructive?: boolean;
      disabled?: boolean;
      title?: string;
      /**
       * Visual treatment for this action. Defaults to `'icon-text'`
       * (current chip behaviour: icon + label visible). `'icon-only'`
       * hides the label text via `sc-sr-only` and reveals it through a
       * Radix tooltip on hover — requires `icon` to be set, otherwise
       * the button has no visible affordance.
       */
      presentation?: "icon-text" | "icon-only";
      run?: () => void;
    };

export function getMenuControlDescriptorId(control: MenuControlDescriptor): string {
  return control.kind === "action" ? `action:${control.id}` : `name:${control.name}`;
}
