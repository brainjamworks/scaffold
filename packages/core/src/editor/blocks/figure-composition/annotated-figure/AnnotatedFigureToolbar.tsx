import { ArrowsClockwiseIcon as ArrowsClockwise, PlusIcon as Plus } from "@phosphor-icons/react";

import { WorkspaceDialog } from "@/ui/components/WorkspaceDialog/WorkspaceDialog";
import { iconMd } from "@/ui/tokens/icon-sizes";

export function AnnotatedFigureToolbar({
  onAddAnnotation,
  onReplaceImage,
}: {
  onAddAnnotation: () => void;
  onReplaceImage: () => void;
}) {
  return (
    <WorkspaceDialog.Toolbar aria-label="Image tools" contentEditable={false}>
      <WorkspaceDialog.ToolbarGroup aria-label="Image actions">
        <WorkspaceDialog.ToolbarButton
          label="Replace annotated figure image"
          onClick={onReplaceImage}
        >
          <ArrowsClockwise size={iconMd} aria-hidden />
        </WorkspaceDialog.ToolbarButton>
        <WorkspaceDialog.ToolbarButton label="Add annotation" onClick={onAddAnnotation}>
          <Plus size={iconMd} aria-hidden />
        </WorkspaceDialog.ToolbarButton>
      </WorkspaceDialog.ToolbarGroup>
    </WorkspaceDialog.Toolbar>
  );
}
