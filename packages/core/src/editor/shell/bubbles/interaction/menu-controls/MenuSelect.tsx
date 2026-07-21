import { CaretDownIcon as CaretDown, CheckIcon as Check } from "@phosphor-icons/react";

import * as SelectMenu from "@/ui/components/Select/SelectMenu";
import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";

import type { MenuSelectOption } from "./types";

import "./menu-controls.css";

interface MenuSelectProps {
  label: string;
  value: string;
  options: readonly MenuSelectOption[];
  disabled?: boolean;
  className?: string;
  onChange: (value: string) => void;
}

export function MenuSelect({
  label,
  value,
  options,
  disabled = false,
  className,
  onChange,
}: MenuSelectProps) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className={cn("sc-menu-select", className)}>
      <SelectMenu.Root disabled={disabled} value={value} onValueChange={onChange}>
        <SelectMenu.Trigger
          aria-label={label}
          className="sc-menu-select-trigger"
          onMouseDown={(event) => event.preventDefault()}
        >
          <SelectMenu.Value className="sc-menu-select-value">
            {selectedOption?.label ?? value}
          </SelectMenu.Value>
          <SelectMenu.Icon asChild>
            <CaretDown aria-hidden className="sc-menu-select-caret" size={14} weight="bold" />
          </SelectMenu.Icon>
        </SelectMenu.Trigger>
        <SelectMenu.Portal>
          <SelectMenu.Content
            align="start"
            aria-label={label}
            className="sc-menu-select-listbox"
            sideOffset={4}
            style={{ zIndex: zIndex.dropdown }}
          >
            <SelectMenu.Viewport className="sc-menu-select-viewport">
              {options.map((option) => (
                <SelectMenu.Item
                  key={option.value}
                  className="sc-menu-select-option"
                  disabled={option.disabled ?? false}
                  value={option.value}
                >
                  <SelectMenu.ItemIndicator className="sc-menu-select-option-check">
                    <Check aria-hidden size={14} weight="bold" />
                  </SelectMenu.ItemIndicator>
                  <SelectMenu.ItemText>{option.label}</SelectMenu.ItemText>
                </SelectMenu.Item>
              ))}
            </SelectMenu.Viewport>
          </SelectMenu.Content>
        </SelectMenu.Portal>
      </SelectMenu.Root>
    </div>
  );
}
