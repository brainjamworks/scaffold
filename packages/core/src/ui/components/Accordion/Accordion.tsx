import * as RadixAccordion from "@radix-ui/react-accordion";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react";
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";

import { cn } from "@/lib/cn";

import "./Accordion.css";

/**
 * Brand-styled Radix Accordion. Used for progressive disclosure inside
 * Sheets and panels — keeps long forms scannable by collapsing sections
 * the author isn't actively editing.
 *
 *     <Accordion.Root type="multiple" defaultValue={['data']}>
 *       <Accordion.Item value="data">
 *         <Accordion.Header>Data</Accordion.Header>
 *         <Accordion.Content>...</Accordion.Content>
 *       </Accordion.Item>
 *     </Accordion.Root>
 *
 * Header chrome: small uppercase tracked label (matches Sheet.Section's
 * typographic voice), caret right of the label, full-width hit area.
 * Content gets a small top padding so it breathes from the header.
 */

const Root = RadixAccordion.Root;

const Item = forwardRef<
  ComponentRef<typeof RadixAccordion.Item>,
  ComponentPropsWithoutRef<typeof RadixAccordion.Item>
>(function Item({ className, ...rest }, ref) {
  return <RadixAccordion.Item ref={ref} className={cn("sc-accordion-item", className)} {...rest} />;
});

interface HeaderProps extends ComponentPropsWithoutRef<typeof RadixAccordion.Trigger> {
  /** Wrap the trigger so consumers pass plain text as children. */
  asTrigger?: never;
}

const Header = forwardRef<ComponentRef<typeof RadixAccordion.Trigger>, HeaderProps>(function Header(
  { className, children, ...rest },
  ref,
) {
  return (
    <RadixAccordion.Header className="sc-accordion-header">
      <RadixAccordion.Trigger ref={ref} className={cn("sc-accordion-trigger", className)} {...rest}>
        <span className="sc-accordion-trigger-label">{children}</span>
        <CaretDown size={14} weight="bold" className="sc-accordion-trigger-icon" aria-hidden />
      </RadixAccordion.Trigger>
    </RadixAccordion.Header>
  );
});

const Content = forwardRef<
  ComponentRef<typeof RadixAccordion.Content>,
  ComponentPropsWithoutRef<typeof RadixAccordion.Content>
>(function Content({ className, children, ...rest }, ref) {
  return (
    <RadixAccordion.Content ref={ref} className={cn("sc-accordion-content", className)} {...rest}>
      <div className="sc-accordion-content-inner">{children}</div>
    </RadixAccordion.Content>
  );
});

export const Accordion = {
  Root,
  Item,
  Header,
  Content,
};
