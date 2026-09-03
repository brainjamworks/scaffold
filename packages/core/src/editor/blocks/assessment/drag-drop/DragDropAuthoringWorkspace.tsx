import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { MediaWorkspace } from "@/editor/media/presentation/MediaWorkspace";
import { cn } from "@/lib/cn";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { WorkspaceDialog } from "@/ui/components/WorkspaceDialog/WorkspaceDialog";

export const DragDropAuthoringWorkspaceRoot = WorkspaceDialog.Root;
export const DragDropAuthoringWorkspaceTrigger = WorkspaceDialog.Trigger;

interface DragDropAuthoringWorkspaceContentProps
  extends Omit<ComponentPropsWithoutRef<typeof WorkspaceDialog.Content>, "title"> {
  title: ReactNode;
  description: ReactNode;
  toolbar?: ReactNode;
}

export const DragDropAuthoringWorkspaceContent = forwardRef<
  HTMLDivElement,
  DragDropAuthoringWorkspaceContentProps
>(function DragDropAuthoringWorkspaceContent(
  { children, description, title, toolbar, ...props },
  ref,
) {
  return (
    <WorkspaceDialog.Content
      {...props}
      ref={ref}
      size="large"
      contentEditable={false}
      style={{ pointerEvents: "auto" }}
      onPointerDownOutside={(event) => {
        props.onPointerDownOutside?.(event);
        if (event.defaultPrevented) return;
        // Selects and popovers portal to the body; choosing an option must
        // not dismiss the workspace.
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest(".sc-select-content, [data-radix-popper-content-wrapper]")
        ) {
          event.preventDefault();
        }
      }}
      onInteractOutside={(event) => {
        props.onInteractOutside?.(event);
        if (event.defaultPrevented) return;
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest(".sc-select-content, [data-radix-popper-content-wrapper]")
        ) {
          event.preventDefault();
        }
      }}
    >
      <WorkspaceDialog.Header>
        <div>
          <WorkspaceDialog.Title>{title}</WorkspaceDialog.Title>
          <WorkspaceDialog.Description>{description}</WorkspaceDialog.Description>
        </div>
        <WorkspaceDialog.Close aria-label="Close Drag and Drop workspace" />
      </WorkspaceDialog.Header>
      {toolbar ? (
        <WorkspaceDialog.Toolbar aria-label="Drag and Drop tools">{toolbar}</WorkspaceDialog.Toolbar>
      ) : null}
      <MediaWorkspace.Root>{children}</MediaWorkspace.Root>
    </WorkspaceDialog.Content>
  );
});

interface DragDropAuthoringActionProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  children: ReactNode;
  intent?: "add" | "delete" | "edit" | "replace" | "select";
  label: string;
}

export const DragDropAuthoringInlineAction = forwardRef<
  HTMLButtonElement,
  DragDropAuthoringActionProps
>(function DragDropAuthoringInlineAction(
  { children, className, intent = "edit", label, onClick, onMouseDown, onPointerDown, ...props },
  ref,
) {
  return (
    <IconButton
      {...props}
      ref={ref}
      aria-label={label}
      title={label}
      className={cn("sc-app-drag-drop__icon-action", className)}
      data-intent={intent}
      size="lg"
      variant="ghost"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
        onMouseDown?.(event);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
    >
      {children}
    </IconButton>
  );
});

export const DragDropAuthoringToolbarAction = forwardRef<
  HTMLButtonElement,
  DragDropAuthoringActionProps
>(function DragDropAuthoringToolbarAction(
  { children, className, intent = "edit", label, onClick, ...props },
  ref,
) {
  return (
    <WorkspaceDialog.ToolbarButton
      {...props}
      ref={ref}
      className={cn("sc-app-drag-drop__icon-action", className)}
      data-intent={intent}
      label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
    >
      {children}
    </WorkspaceDialog.ToolbarButton>
  );
});

export const DragDropAuthoringWorkspace = {
  Root: DragDropAuthoringWorkspaceRoot,
  Trigger: DragDropAuthoringWorkspaceTrigger,
  Content: DragDropAuthoringWorkspaceContent,
  InlineAction: DragDropAuthoringInlineAction,
  ToolbarAction: DragDropAuthoringToolbarAction,
  ToolbarGroup: WorkspaceDialog.ToolbarGroup,
} as const;
