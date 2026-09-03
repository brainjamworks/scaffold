import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { MediaWorkspace } from "@/editor/media/presentation/MediaWorkspace";
import { WorkspaceDialog } from "@/ui/components/WorkspaceDialog/WorkspaceDialog";

export const DragDropAuthoringWorkspaceRoot = WorkspaceDialog.Root;
export const DragDropAuthoringWorkspaceTrigger = WorkspaceDialog.Trigger;

export const DragDropAuthoringWorkspaceContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof WorkspaceDialog.Content> & {
    title: ReactNode;
    description: ReactNode;
  }
>(function DragDropAuthoringWorkspaceContent({ children, description, title, ...props }, ref) {
  return (
    <WorkspaceDialog.Content {...props} ref={ref} size="large" contentEditable={false}>
      <WorkspaceDialog.Header>
        <div>
          <WorkspaceDialog.Title>{title}</WorkspaceDialog.Title>
          <WorkspaceDialog.Description>{description}</WorkspaceDialog.Description>
        </div>
        <WorkspaceDialog.Close aria-label="Close Drag and Drop workspace" />
      </WorkspaceDialog.Header>
      <MediaWorkspace.Root>{children}</MediaWorkspace.Root>
    </WorkspaceDialog.Content>
  );
});

export const DragDropAuthoringWorkspace = {
  Root: DragDropAuthoringWorkspaceRoot,
  Trigger: DragDropAuthoringWorkspaceTrigger,
  Content: DragDropAuthoringWorkspaceContent,
} as const;
