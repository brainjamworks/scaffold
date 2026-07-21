import {
  CaretDownIcon as CaretDown,
  CheckIcon as Check,
  MagnifyingGlassIcon as Search,
} from "@phosphor-icons/react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";

import * as PopoverPrimitive from "../Popover/Popover";

import "./Combobox.css";

/**
 * Searchable single-select popover. The dropdown vocabulary for any
 * picker whose option list is too long to scan at a glance (≥ ~10
 * items) or which benefits from typeahead (programming languages,
 * locales, currencies, time zones). Below that bar reach for
 * `Select` instead — same `options` shape, drop-in API.
 *
 * Built on Radix Popover (already in the scaffold primitive set);
 * no Ariakit, no second headless library. Filtering is a plain
 * substring match on `label` (and `value` as a fallback) so the
 * keyboard alias works ("ts" finds "TypeScript").
 */

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

export interface ComboboxProps {
  /** Accessible name for the control, distinct from the selected value. */
  "aria-label"?: string;
  /** Currently selected option value. */
  value: string;
  /** Callback fired when the user picks a new option. */
  onChange: (value: string) => void;
  /** Options to render. The order is the default order shown when
   * the search input is empty. */
  options: readonly ComboboxOption[];
  /** Optional label fallback when no option matches `value`. */
  emptyTriggerLabel?: string;
  /** Search input placeholder. */
  searchPlaceholder?: string;
  /** Shown inside the panel when the filter matches nothing. */
  emptyStateLabel?: string;
  /** Trigger button class overrides. */
  className?: string;
  /** Panel popover class overrides. */
  contentClassName?: string;
  /** Optional custom node to render inside the trigger in place of
   * the selected label (e.g. an icon + label pair). */
  renderTrigger?: (option: ComboboxOption | undefined) => ReactNode;
  /** Disable the trigger. */
  disabled?: boolean;
  /** Popover side alignment. */
  align?: "start" | "center" | "end";
  /** Popover preferred side. */
  side?: "top" | "right" | "bottom" | "left";
}

function comboboxOptionId(baseId: string, optionValue: string): string {
  const valueId = optionValue.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `${baseId}-option-${valueId || "value"}`;
}

export const Combobox = forwardRef<ComponentRef<typeof PopoverPrimitive.Trigger>, ComboboxProps>(
  function Combobox(
    {
      "aria-label": ariaLabel,
      value,
      onChange,
      options,
      emptyTriggerLabel = "",
      searchPlaceholder = "Search…",
      emptyStateLabel = "No matches",
      className,
      contentClassName,
      renderTrigger,
      disabled,
      align = "start",
      side = "bottom",
    },
    ref,
  ) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const generatedId = useId();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const baseId = `sc-combobox-${generatedId.replace(/:/g, "")}`;
    const listboxId = `${baseId}-listbox`;
    const controlLabel = ariaLabel ?? searchPlaceholder;

    const selected = useMemo(
      () => options.find((option) => option.value === value),
      [options, value],
    );

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return options;
      return options.filter((option) => {
        const label = option.label.toLowerCase();
        const valueText = option.value.toLowerCase();
        const description = option.description?.toLowerCase() ?? "";
        return label.includes(q) || valueText.includes(q) || description.includes(q);
      });
    }, [options, query]);

    useEffect(() => {
      if (!open) {
        setQuery("");
        setActiveIndex(0);
        return;
      }
      const selectedIndex = options.findIndex((option) => option.value === value);
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }, [open, options, value]);

    // Keep the active index inside `filtered`'s bounds whenever the
    // filter shrinks the list.
    useEffect(() => {
      if (activeIndex >= filtered.length) {
        setActiveIndex(Math.max(0, filtered.length - 1));
      }
    }, [filtered.length, activeIndex]);

    // Scroll the active row into view when navigated by keyboard.
    useEffect(() => {
      if (!open) return;
      const node = itemRefs.current[activeIndex];
      if (node) node.scrollIntoView({ block: "nearest" });
    }, [activeIndex, open]);

    const handleSelect = useCallback(
      (next: string) => {
        onChange(next);
        setOpen(false);
      },
      [onChange],
    );

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) =>
          filtered.length === 0 ? 0 : Math.min(index + 1, filtered.length - 1),
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const choice = filtered[activeIndex];
        if (choice) handleSelect(choice.value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      } else if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
      } else if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(Math.max(0, filtered.length - 1));
      }
    };

    const triggerContent = renderTrigger ? (
      renderTrigger(selected)
    ) : (
      <span className="sc-combobox-trigger-label">{selected?.label ?? emptyTriggerLabel}</span>
    );
    const activeOption = filtered[activeIndex];
    const activeOptionId =
      open && activeOption ? comboboxOptionId(baseId, activeOption.value) : undefined;

    return (
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            ref={ref}
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-label={selected ? `${controlLabel}: ${selected.label}` : controlLabel}
            className={cn("sc-combobox-trigger", className)}
          >
            {triggerContent}
            <CaretDown size={14} aria-hidden className="sc-combobox-trigger-icon" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align={align}
            hideWhenDetached={false}
            side={side}
            sideOffset={4}
            style={{ zIndex: zIndex.popover }}
            className={cn("sc-combobox-content", contentClassName)}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
          >
            <div className="sc-combobox-search-row">
              <Search size={14} aria-hidden className="sc-combobox-search-icon" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                role="combobox"
                aria-label={`${controlLabel} search`}
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-activedescendant={activeOptionId}
                className="sc-combobox-search-input"
              />
            </div>
            <div
              id={listboxId}
              role="listbox"
              aria-label={`${controlLabel} options`}
              className="sc-combobox-listbox"
              // Reset refs on every render so they match `filtered`.
              ref={() => {
                itemRefs.current = itemRefs.current.slice(0, filtered.length);
              }}
            >
              {filtered.length === 0 ? (
                <div role="status" aria-live="polite" className="sc-combobox-empty">
                  {emptyStateLabel}
                </div>
              ) : (
                filtered.map((option, index) => {
                  const isSelected = option.value === value;
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={option.value}
                      id={comboboxOptionId(baseId, option.value)}
                      ref={(node) => {
                        itemRefs.current[index] = node;
                      }}
                      type="button"
                      role="option"
                      aria-label={option.label}
                      aria-selected={isActive}
                      aria-describedby={
                        option.description
                          ? `${comboboxOptionId(baseId, option.value)}-description`
                          : undefined
                      }
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => handleSelect(option.value)}
                      className="sc-combobox-option"
                      data-active={isActive ? "true" : undefined}
                    >
                      <span className="sc-combobox-option-copy">
                        <span className="sc-combobox-option-label">{option.label}</span>
                        {option.description ? (
                          <span
                            id={`${comboboxOptionId(baseId, option.value)}-description`}
                            className="sc-combobox-option-description"
                          >
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                      {isSelected ? (
                        <Check
                          size={12}
                          weight="bold"
                          aria-hidden
                          className="sc-combobox-option-check"
                        />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  },
);
