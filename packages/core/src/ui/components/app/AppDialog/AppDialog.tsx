import {
  forwardRef,
  useCallback,
  useState,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { AUTHORING_CHROME_SUPPRESSION_ATTR } from "@/editor/interactions/dom/authoring-chrome";
import { cn } from "@/lib/cn";
import * as Dialog from "@/ui/components/Dialog/Dialog";
import { OverlayBoundary } from "@/ui/overlays/OverlayBoundary";
import { zIndex } from "@/ui/overlays/z-index";

import "./AppDialog.css";

export type AppDialogIntent = "neutral" | "warning" | "danger";

const Root = Dialog.Root;
const Trigger = Dialog.Trigger;
const Close = Dialog.Close;

interface AppDialogContentProps extends Omit<
  ComponentPropsWithoutRef<typeof Dialog.Content>,
  "children"
> {
  children: ReactNode;
  intent?: AppDialogIntent;
}

const Content = forwardRef<ComponentRef<typeof Dialog.Content>, AppDialogContentProps>(
  function Content({ children, className, intent = "neutral", style, ...rest }, forwardedRef) {
    const [contentElement, setContentElement] = useState<ComponentRef<
      typeof Dialog.Content
    > | null>(null);
    const contentRef = useCallback(
      (element: ComponentRef<typeof Dialog.Content> | null) => {
        setContentElement(element);
        if (typeof forwardedRef === "function") forwardedRef(element);
        else if (forwardedRef) forwardedRef.current = element;
      },
      [forwardedRef],
    );

    return (
      <Dialog.Portal>
        <Dialog.Overlay
          aria-hidden="true"
          className="sc-app-dialog-overlay"
          style={{ zIndex: zIndex.modalBackdrop }}
        />
        <Dialog.Content
          {...rest}
          ref={contentRef}
          className={cn("sc-app-dialog-content", className)}
          data-intent={intent}
          {...{ [AUTHORING_CHROME_SUPPRESSION_ATTR]: "" }}
          style={{ ...style, zIndex: zIndex.modal }}
        >
          <OverlayBoundary
            collisionBoundary={contentElement}
            container={contentElement}
            kind="contained"
          >
            {children}
          </OverlayBoundary>
        </Dialog.Content>
      </Dialog.Portal>
    );
  },
);

function Header({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <header className={cn("sc-app-dialog-header", className)} {...rest} />;
}

const Title = forwardRef<
  ComponentRef<typeof Dialog.Title>,
  ComponentPropsWithoutRef<typeof Dialog.Title>
>(function Title({ className, ...rest }, ref) {
  return <Dialog.Title ref={ref} className={cn("sc-app-dialog-title", className)} {...rest} />;
});

const Description = forwardRef<
  ComponentRef<typeof Dialog.Description>,
  ComponentPropsWithoutRef<typeof Dialog.Description>
>(function Description({ className, ...rest }, ref) {
  return (
    <Dialog.Description
      ref={ref}
      className={cn("sc-app-dialog-description", className)}
      {...rest}
    />
  );
});

function Body({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sc-app-dialog-body", className)} {...rest} />;
}

function Actions({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <footer className={cn("sc-app-dialog-actions", className)} {...rest} />;
}

export const AppDialog = {
  Root,
  Trigger,
  Close,
  Content,
  Header,
  Title,
  Description,
  Body,
  Actions,
};
