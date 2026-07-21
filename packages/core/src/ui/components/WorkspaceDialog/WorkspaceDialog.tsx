import { XIcon as X } from "@phosphor-icons/react";
import {
  forwardRef,
  useCallback,
  useState,
  type CSSProperties,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";

import * as Dialog from "../Dialog/Dialog";
import { IconButton, type IconButtonProps } from "../IconButton/IconButton";
import { OverlayBoundary } from "../OverlayBoundary/OverlayBoundary";
import * as ToolbarPrimitive from "../Toolbar/Toolbar";
import * as Tooltip from "../Tooltip/Tooltip";

import "./WorkspaceDialog.css";

export type WorkspaceDialogSize = "small" | "medium" | "large";

const workspaceDialogInlineSizes: Record<WorkspaceDialogSize, string> = {
  small: "40rem",
  medium: "56rem",
  large: "76rem",
};

interface WorkspaceDialogPresentationStyle extends CSSProperties {
  "--sc-workspace-dialog-inline-size": string;
  "--sc-workspace-dialog-viewport-inline-cap": string;
  "--sc-workspace-dialog-block-size-cap": string;
}

function getWorkspaceDialogPresentationStyle(
  size: WorkspaceDialogSize,
): WorkspaceDialogPresentationStyle {
  return {
    "--sc-workspace-dialog-inline-size": workspaceDialogInlineSizes[size],
    "--sc-workspace-dialog-viewport-inline-cap": "calc(100vw - 2rem)",
    "--sc-workspace-dialog-block-size-cap": "min(calc(100dvh - 2rem), 48rem)",
    width: "var(--sc-workspace-dialog-inline-size)",
    maxWidth: "var(--sc-workspace-dialog-viewport-inline-cap)",
    height: "var(--sc-workspace-dialog-block-size-cap)",
    maxHeight: "var(--sc-workspace-dialog-block-size-cap)",
    zIndex: zIndex.modalContent,
  };
}

const Root = Dialog.Root;
const Trigger = Dialog.Trigger;

interface WorkspaceDialogContentProps extends Omit<
  ComponentPropsWithoutRef<typeof Dialog.Content>,
  "children"
> {
  children: ReactNode;
  size?: WorkspaceDialogSize;
}

const Content = forwardRef<ComponentRef<typeof Dialog.Content>, WorkspaceDialogContentProps>(
  function Content({ children, className, size = "medium", style, ...rest }, ref) {
    const presentationStyle = getWorkspaceDialogPresentationStyle(size);
    const [contentElement, setContentElement] = useState<ComponentRef<
      typeof Dialog.Content
    > | null>(null);
    const contentRef = useCallback(
      (element: ComponentRef<typeof Dialog.Content> | null) => {
        setContentElement(element);
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      },
      [ref],
    );

    return (
      <Dialog.Portal>
        <Dialog.Overlay
          className="sc-workspace-dialog-overlay"
          style={{ zIndex: zIndex.modalBackdrop }}
        />
        <Dialog.Content
          {...rest}
          ref={contentRef}
          className={cn("sc-workspace-dialog-content", className)}
          data-size={size}
          style={{ ...presentationStyle, ...style, zIndex: zIndex.modalContent }}
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
  return <header className={cn("sc-workspace-dialog-header", className)} {...rest} />;
}

interface WorkspaceDialogToolbarProps extends Omit<
  ComponentPropsWithoutRef<typeof ToolbarPrimitive.Root>,
  "orientation"
> {
  "aria-label": string;
}

const Toolbar = forwardRef<ComponentRef<typeof ToolbarPrimitive.Root>, WorkspaceDialogToolbarProps>(
  function Toolbar({ children, className, ...rest }, ref) {
    return (
      <Tooltip.Provider delayDuration={350}>
        <ToolbarPrimitive.Root
          {...rest}
          ref={ref}
          className={cn("sc-workspace-dialog-toolbar", className)}
          orientation="horizontal"
        >
          {children}
        </ToolbarPrimitive.Root>
      </Tooltip.Provider>
    );
  },
);

interface WorkspaceDialogToolbarGroupProps extends HTMLAttributes<HTMLDivElement> {
  "aria-label": string;
}

function ToolbarGroup({ className, ...rest }: WorkspaceDialogToolbarGroupProps) {
  return (
    <div role="group" className={cn("sc-workspace-dialog-toolbar-group", className)} {...rest} />
  );
}

interface WorkspaceDialogToolbarButtonProps extends Omit<
  IconButtonProps,
  "aria-label" | "aria-pressed" | "children" | "size" | "variant"
> {
  active?: boolean;
  children: ReactNode;
  label: string;
}

const ToolbarButton = forwardRef<HTMLButtonElement, WorkspaceDialogToolbarButtonProps>(
  function ToolbarButton({ active, children, className, disabled, label, ...rest }, ref) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <ToolbarPrimitive.Button asChild disabled={disabled}>
            <IconButton
              {...rest}
              ref={ref}
              aria-label={label}
              aria-pressed={active}
              className={cn("sc-workspace-dialog-toolbar-button", active && "is-active", className)}
              disabled={disabled}
              size="md"
              variant="ghost"
            >
              {children}
            </IconButton>
          </ToolbarPrimitive.Button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="bottom" sideOffset={8}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  },
);

const ToolbarSeparator = forwardRef<
  ComponentRef<typeof ToolbarPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof ToolbarPrimitive.Separator>
>(function ToolbarSeparator({ className, ...rest }, ref) {
  return (
    <ToolbarPrimitive.Separator
      {...rest}
      ref={ref}
      className={cn("sc-workspace-dialog-toolbar-separator", className)}
    />
  );
});

const Title = forwardRef<
  ComponentRef<typeof Dialog.Title>,
  ComponentPropsWithoutRef<typeof Dialog.Title>
>(function Title({ className, ...rest }, ref) {
  return (
    <Dialog.Title {...rest} ref={ref} className={cn("sc-workspace-dialog-title", className)} />
  );
});

const Description = forwardRef<
  ComponentRef<typeof Dialog.Description>,
  ComponentPropsWithoutRef<typeof Dialog.Description>
>(function Description({ className, ...rest }, ref) {
  return (
    <Dialog.Description
      {...rest}
      ref={ref}
      className={cn("sc-workspace-dialog-description", className)}
    />
  );
});

function Body({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sc-workspace-dialog-body", className)} {...rest} />;
}

function Actions({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <footer className={cn("sc-workspace-dialog-actions", className)} {...rest} />;
}

interface WorkspaceDialogCloseProps extends IconButtonProps {
  children?: ReactNode;
}

const Close = forwardRef<HTMLButtonElement, WorkspaceDialogCloseProps>(function Close(
  {
    "aria-label": ariaLabel = "Close workspace",
    children,
    className,
    size = "md",
    variant = "ghost",
    ...rest
  },
  ref,
) {
  return (
    <Dialog.Close asChild>
      <IconButton
        {...rest}
        ref={ref}
        aria-label={ariaLabel}
        className={cn("sc-workspace-dialog-close", className)}
        size={size}
        variant={variant}
      >
        {children ?? <X size={16} aria-hidden />}
      </IconButton>
    </Dialog.Close>
  );
});

export const WorkspaceDialog = {
  Root,
  Trigger,
  Content,
  Header,
  Toolbar,
  ToolbarGroup,
  ToolbarButton,
  ToolbarSeparator,
  Title,
  Description,
  Body,
  Actions,
  Close,
};
