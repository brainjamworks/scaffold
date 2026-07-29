import { CaretDownIcon as CaretDown, CheckIcon as Check } from "@phosphor-icons/react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";

import * as RadixSelect from "./SelectMenu";

import "./Select.css";

/**
 * Styled dropdown built on Radix Select. One dropdown vocabulary
 * across the editor — the runtime dropdown-assessment, the chart-type
 * picker, every settings field — all funnel through here so the chrome
 * is identical regardless of surface.
 *
 * Two ways to use it:
 *
 *   1. **Simple options array (90% of cases).** Pass `options`, `value`,
 *      `onChange`. The component handles trigger + portal + item
 *      rendering with brand chrome.
 *
 *          <Select
 *            value={chartType}
 *            onChange={setChartType}
 *            options={[
 *              { value: 'bar', label: 'Bar' },
 *              { value: 'line', label: 'Line' },
 *            ]}
 *          />
 *
 *   2. **Composable subcomponents for rich items.** Use
 *      `Select.Root` / `.Trigger` / `.Content` / `.Item` directly when
 *      items need icons, badges, group labels, separators, or
 *      multi-line content. The dropdown assessment runtime does this.
 *
 *          <Select.Root value={x} onValueChange={setX}>
 *            <Select.Trigger />
 *            <Select.Content>
 *              <Select.Item value="a"><Icon /> Rich item</Select.Item>
 *            </Select.Content>
 *          </Select.Root>
 *
 * Reach for the raw `SelectMenu` namespace re-export only when you need
 * to escape `Select`'s chrome entirely — exotic positioning,
 * non-standard trigger shape, etc.
 */

interface SelectVariantProps {
  invalid?: boolean | null | undefined;
}

function triggerVariants(_options?: SelectVariantProps): string {
  return "sc-select-trigger";
}

// ─── Subcomponents (composable API) ──────────────────────────────────

const Root = RadixSelect.Root;
const Group = RadixSelect.Group;
const Value = RadixSelect.Value;

interface SelectTriggerProps
  extends
    Omit<ComponentPropsWithoutRef<typeof RadixSelect.Trigger>, "children">,
    SelectVariantProps {
  placeholder?: string;
  /** Render-prop access to the inner Value if richer rendering is needed. */
  children?: ReactNode;
}

const Trigger = forwardRef<ComponentRef<typeof RadixSelect.Trigger>, SelectTriggerProps>(
  function Trigger({ className, placeholder, children, invalid, ...rest }, ref) {
    return (
      <RadixSelect.Trigger
        ref={ref}
        className={cn(triggerVariants({ invalid }), className)}
        aria-invalid={invalid || undefined}
        data-invalid={invalid ? "true" : undefined}
        {...rest}
      >
        {children ?? <RadixSelect.Value placeholder={placeholder} />}
        <RadixSelect.Icon className="sc-select-trigger-icon">
          <CaretDown size={14} weight="bold" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
    );
  },
);

const Content = forwardRef<
  ComponentRef<typeof RadixSelect.Content>,
  ComponentPropsWithoutRef<typeof RadixSelect.Content>
>(function Content(
  { className, children, position = "popper", sideOffset = 4, style, ...rest },
  ref,
) {
  const contentStyle: CSSProperties = {
    zIndex: zIndex.popover,
    ...style,
  };

  return (
    <RadixSelect.Portal>
      <RadixSelect.Content
        ref={ref}
        position={position}
        sideOffset={sideOffset}
        // Popover z-index (250) sits above modal-content (220), so a
        // Select inside a Sheet or Dialog portals above its host.
        style={contentStyle}
        className={cn("sc-select-content", className)}
        {...rest}
      >
        <RadixSelect.Viewport className="sc-select-viewport">{children}</RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  );
});

const Item = forwardRef<
  ComponentRef<typeof RadixSelect.Item>,
  ComponentPropsWithoutRef<typeof RadixSelect.Item>
>(function Item({ className, children, ...rest }, ref) {
  return (
    <RadixSelect.Item ref={ref} className={cn("sc-select-item", className)} {...rest}>
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
      <RadixSelect.ItemIndicator className="sc-select-item-indicator">
        <Check size={14} weight="bold" />
      </RadixSelect.ItemIndicator>
    </RadixSelect.Item>
  );
});

const Separator = forwardRef<
  ComponentRef<typeof RadixSelect.Separator>,
  ComponentPropsWithoutRef<typeof RadixSelect.Separator>
>(function Separator({ className, ...rest }, ref) {
  return (
    <RadixSelect.Separator ref={ref} className={cn("sc-select-separator", className)} {...rest} />
  );
});

const SelectLabel = forwardRef<
  ComponentRef<typeof RadixSelect.Label>,
  ComponentPropsWithoutRef<typeof RadixSelect.Label>
>(function SelectLabel({ className, ...rest }, ref) {
  return <RadixSelect.Label ref={ref} className={cn("sc-select-label", className)} {...rest} />;
});

// ─── Simple options-based API ───────────────────────────────────────

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (next: string) => void;
  options: readonly SelectOption[];
  "aria-describedby"?: string;
  "aria-labelledby"?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  /** Width / className overrides applied to the trigger. */
  className?: string;
}

/**
 * The everyday case: pass options, get a brand-styled dropdown. For
 * rich item content (icons, multi-line, groups, separators), use the
 * composable subcomponents instead — see `Select.Root` / `.Trigger` /
 * `.Content` / `.Item`.
 */
function SimpleSelect({
  value,
  onChange,
  options,
  "aria-describedby": ariaDescribedBy,
  "aria-labelledby": ariaLabelledBy,
  placeholder,
  disabled,
  invalid,
  id,
  name,
  required,
  className,
}: SelectProps) {
  return (
    <Root
      value={value}
      onValueChange={onChange}
      {...(disabled !== undefined ? { disabled } : {})}
      {...(name !== undefined ? { name } : {})}
      {...(required !== undefined ? { required } : {})}
    >
      <Trigger
        {...(id !== undefined ? { id } : {})}
        {...(ariaDescribedBy !== undefined ? { "aria-describedby": ariaDescribedBy } : {})}
        {...(ariaLabelledBy !== undefined ? { "aria-labelledby": ariaLabelledBy } : {})}
        {...(invalid !== undefined ? { invalid } : {})}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(className !== undefined ? { className } : {})}
      />
      <Content>
        {options.map((option) => (
          <Item
            key={option.value}
            value={option.value}
            {...(option.disabled !== undefined ? { disabled: option.disabled } : {})}
          >
            {option.label}
          </Item>
        ))}
      </Content>
    </Root>
  );
}

// Attach subcomponents to the simple Select so the same import covers
// both APIs. `<Select options={...} />` for the everyday case;
// `<Select.Root>...<Select.Item>` for rich items.
export const Select = Object.assign(SimpleSelect, {
  Root,
  Trigger,
  Value,
  Content,
  Item,
  Separator,
  Group,
  Label: SelectLabel,
});

export { triggerVariants as selectVariants };
