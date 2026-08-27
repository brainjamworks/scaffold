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

type ImageHotspotAuthoringWorkspaceRootProps = ComponentPropsWithoutRef<
  typeof WorkspaceDialog.Root
>;

export function ImageHotspotAuthoringWorkspaceRoot(props: ImageHotspotAuthoringWorkspaceRootProps) {
  return <WorkspaceDialog.Root {...props} />;
}

export const ImageHotspotAuthoringWorkspaceTrigger = WorkspaceDialog.Trigger;

interface ImageHotspotAuthoringWorkspaceContentProps {
  children: ReactNode;
  className?: string;
  description: ReactNode;
  title: ReactNode;
  toolbar?: ReactNode;
}

export const ImageHotspotAuthoringWorkspaceContent = forwardRef<
  HTMLDivElement,
  ImageHotspotAuthoringWorkspaceContentProps
>(function ImageHotspotAuthoringWorkspaceContent(
  { children, className, description, title, toolbar },
  ref,
) {
  return (
    <WorkspaceDialog.Content
      ref={ref}
      className={cn("sc-app-image-hotspot-workspace", className)}
      contentEditable={false}
      size="large"
      style={{ pointerEvents: "auto" }}
    >
      <WorkspaceDialog.Header>
        <div>
          <WorkspaceDialog.Title>{title}</WorkspaceDialog.Title>
          <WorkspaceDialog.Description>{description}</WorkspaceDialog.Description>
        </div>
        <WorkspaceDialog.Close
          aria-label="Close expanded hotspot workspace"
          className="sc-app-image-hotspot__icon-action"
        />
      </WorkspaceDialog.Header>
      {toolbar ? (
        <WorkspaceDialog.Toolbar aria-label="Image hotspot tools">
          {toolbar}
        </WorkspaceDialog.Toolbar>
      ) : null}
      <MediaWorkspace.Root>{children}</MediaWorkspace.Root>
    </WorkspaceDialog.Content>
  );
});

interface ImageHotspotAuthoringActionProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> {
  children: ReactNode;
  intent?: "add" | "delete" | "edit" | "replace" | "select";
  label: string;
}

export const ImageHotspotAuthoringInlineAction = forwardRef<
  HTMLButtonElement,
  ImageHotspotAuthoringActionProps
>(function ImageHotspotAuthoringInlineAction(
  { children, className, intent = "edit", label, onClick, onMouseDown, onPointerDown, ...props },
  ref,
) {
  return (
    <IconButton
      {...props}
      ref={ref}
      aria-label={label}
      title={label}
      className={cn("sc-app-image-hotspot__icon-action", className)}
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

export const ImageHotspotAuthoringToolbarAction = forwardRef<
  HTMLButtonElement,
  ImageHotspotAuthoringActionProps
>(function ImageHotspotAuthoringToolbarAction(
  { children, className, intent = "edit", label, onClick, ...props },
  ref,
) {
  return (
    <WorkspaceDialog.ToolbarButton
      {...props}
      ref={ref}
      className={cn("sc-app-image-hotspot__icon-action", className)}
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

export const ImageHotspotAuthoringWorkspace = {
  Content: ImageHotspotAuthoringWorkspaceContent,
  InlineAction: ImageHotspotAuthoringInlineAction,
  Root: ImageHotspotAuthoringWorkspaceRoot,
  ToolbarAction: ImageHotspotAuthoringToolbarAction,
  ToolbarGroup: WorkspaceDialog.ToolbarGroup,
  Trigger: ImageHotspotAuthoringWorkspaceTrigger,
} as const;
