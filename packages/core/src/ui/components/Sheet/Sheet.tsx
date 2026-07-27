import * as RadixDialog from "@radix-ui/react-dialog";
import { XIcon as X } from "@phosphor-icons/react";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { inertOthers } from "aria-hidden";
import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { RemoveScroll } from "react-remove-scroll";

import { AUTHORING_CHROME_SUPPRESSION_ATTR } from "@/editor/interactions/dom/authoring-chrome";
import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";

import { IconButton } from "../IconButton/IconButton";
import { OverlayBoundary } from "../OverlayBoundary/OverlayBoundary";
import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";

import "./Sheet.css";

/**
 * Side-anchored slide-in panel. Built on Radix Dialog so it inherits
 * focus trap, ESC-to-close, and ARIA semantics. Used for chart
 * configuration, block settings, anything large enough that a modal
 * dialog would feel cramped but doesn't deserve a route change.
 *
 * Composition (mirrors Dialog):
 *
 *     <Sheet.Root open={open} onOpenChange={setOpen}>
 *       <Sheet.Content side="right">
 *         <Sheet.Header>
 *           <Sheet.Title>Edit chart</Sheet.Title>
 *           <Sheet.Description>...</Sheet.Description>
 *         </Sheet.Header>
 *         <Sheet.Body>...</Sheet.Body>
 *         <Sheet.Footer>...</Sheet.Footer>
 *       </Sheet.Content>
 *     </Sheet.Root>
 *
 * `Sheet.Header` mounts a built-in close button; pass `closable={false}`
 * to suppress.
 */

type SheetRootProps = Omit<ComponentPropsWithoutRef<typeof RadixDialog.Root>, "modal">;

function Root(props: SheetRootProps) {
  return <RadixDialog.Root {...props} modal={false} />;
}

const Trigger = RadixDialog.Trigger;
const Close = RadixDialog.Close;

function Portal(props: RadixDialog.DialogPortalProps) {
  const resolution = useOverlayBoundary();

  if (resolution.status === "pending") return null;
  if (resolution.status === "unscoped") return <RadixDialog.Portal {...props} />;

  return <RadixDialog.Portal {...props} container={resolution.environment.host} />;
}

type SheetSide = "right" | "left" | "top" | "bottom";

interface SheetContentVariantProps {
  side?: SheetSide | null;
}

function sheetContentVariants(_options?: SheetContentVariantProps): string {
  return "sc-sheet-content";
}

interface SheetContentProps
  extends
    Omit<ComponentPropsWithoutRef<typeof RadixDialog.Content>, "children">,
    SheetContentVariantProps {
  children: ReactNode;
}

const Content = forwardRef<ComponentRef<typeof RadixDialog.Content>, SheetContentProps>(
  function Content({ side = "right", className, children, style, ...rest }, ref) {
    const resolvedSide = side ?? "right";
    const openerRef = useRef<HTMLElement | null>(null);
    const [overlayElement, setOverlayElement] = useState<HTMLDivElement | null>(null);
    const [contentElement, setContentElement] = useState<ComponentRef<
      typeof RadixDialog.Content
    > | null>(null);
    const contentRef = useCallback(
      (element: ComponentRef<typeof RadixDialog.Content> | null) => {
        setContentElement(element);
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      },
      [ref],
    );

    useLayoutEffect(() => {
      if (contentElement === null || overlayElement === null) return;
      const portalHost = contentElement.parentElement;
      if (portalHost === null || overlayElement.parentElement !== portalHost) return;
      const isolationRoot = portalHost.parentElement;
      if (isolationRoot === null) return;
      return inertOthers([overlayElement, contentElement], isolationRoot, "data-sc-sheet-inert");
    }, [contentElement, overlayElement]);

    return (
      <Portal>
        <div
          ref={setOverlayElement}
          aria-hidden="true"
          className="sc-sheet-overlay"
          data-state="open"
          style={{ zIndex: zIndex.modalBackdrop }}
        />
        <RemoveScroll allowPinchZoom forwardProps>
          <FocusScope asChild loop trapped>
            <RadixDialog.Content
              {...rest}
              ref={contentRef}
              className={cn(sheetContentVariants({ side: resolvedSide }), className)}
              data-side={resolvedSide}
              {...{ [AUTHORING_CHROME_SUPPRESSION_ATTR]: "" }}
              onCloseAutoFocus={(event) => {
                rest.onCloseAutoFocus?.(event);
                if (event.defaultPrevented) return;
                event.preventDefault();
                const opener = openerRef.current;
                if (opener?.isConnected) opener.focus({ preventScroll: true });
                openerRef.current = null;
              }}
              onFocusOutside={(event) => {
                rest.onFocusOutside?.(event);
                if (!event.defaultPrevented) event.preventDefault();
              }}
              onOpenAutoFocus={(event) => {
                const ownerDocument = contentElement?.ownerDocument;
                const activeElement = ownerDocument?.activeElement;
                openerRef.current =
                  activeElement instanceof HTMLElement && activeElement !== ownerDocument?.body
                    ? activeElement
                    : null;
                rest.onOpenAutoFocus?.(event);
              }}
              style={{
                ...(style as CSSProperties | undefined),
                zIndex: zIndex.modal,
              }}
            >
              <OverlayBoundary
                collisionBoundary={contentElement}
                container={contentElement}
                kind="contained"
              >
                {children}
              </OverlayBoundary>
            </RadixDialog.Content>
          </FocusScope>
        </RemoveScroll>
      </Portal>
    );
  },
);

interface SheetHeaderProps extends HTMLAttributes<HTMLElement> {
  closable?: boolean;
  closeLabel?: string;
}

function Header({
  className,
  children,
  closable = true,
  closeLabel = "Close",
  ...rest
}: SheetHeaderProps) {
  return (
    <header className={cn("sc-sheet-header", className)} {...rest}>
      <div className="sc-sheet-header-copy">{children}</div>
      {closable && (
        <RadixDialog.Close asChild>
          <IconButton variant="ghost" size="md" aria-label={closeLabel}>
            <X size={16} />
          </IconButton>
        </RadixDialog.Close>
      )}
    </header>
  );
}

const Title = forwardRef<
  ComponentRef<typeof RadixDialog.Title>,
  ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(function Title({ className, ...rest }, ref) {
  return <RadixDialog.Title ref={ref} className={cn("sc-sheet-title", className)} {...rest} />;
});

const Description = forwardRef<
  ComponentRef<typeof RadixDialog.Description>,
  ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(function Description({ className, ...rest }, ref) {
  return (
    <RadixDialog.Description
      ref={ref}
      className={cn("sc-sheet-description", className)}
      {...rest}
    />
  );
});

function Body({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sc-sheet-body", className)} {...rest} />;
}

function Footer({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <footer className={cn("sc-sheet-footer", className)} {...rest} />;
}

/** Section divider for grouped panels inside a Sheet.Body. */
interface SheetSectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
}

function Section({ className, title, children, ...rest }: SheetSectionProps) {
  return (
    <section className={cn("sc-sheet-section", className)} {...rest}>
      {title && <h3 className="sc-sheet-section-title">{title}</h3>}
      {children}
    </section>
  );
}

export const Sheet = {
  Root,
  Trigger,
  Close,
  Portal,
  Content,
  Header,
  Title,
  Description,
  Body,
  Footer,
  Section,
};

export { sheetContentVariants };
