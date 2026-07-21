import {
  CaretDownIcon as CaretDown,
  CaretUpIcon as CaretUp,
  XIcon as X,
} from "@phosphor-icons/react";
import type { Editor, Extensions } from "@tiptap/core";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { MediaWorkspace } from "@/editor/media/presentation/MediaWorkspace";
import { RichTextArea } from "@/editor/rich-text/authoring/nested-overlay/RichTextArea";
import { renderRuntimeRichTextNode } from "@/editor/rich-text/runtime/render-rich-text";
import { WorkspaceDialog } from "@/ui/components/WorkspaceDialog/WorkspaceDialog";

import { createAnnotatedFigureCaptionTarget } from "./annotated-figure-caption-editor";
import type { AnnotatedFigureAnnotationProjection } from "./annotated-figure-document-model";
import { AnnotatedFigureToolbar } from "./AnnotatedFigureToolbar";

export interface AnnotatedFigureWorkspaceProps {
  annotations: readonly AnnotatedFigureAnnotationProjection[];
  canvas: ReactNode;
  captionEditorExtensions: Extensions;
  figureId: string;
  onAddAnnotation: () => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onMoveAnnotation: (
    annotationId: string,
    direction: "previous" | "next",
    relativeToId: string,
  ) => void;
  onReplaceImage: () => void;
  onSelectAnnotation: (annotationId: string) => void;
  outerEditor: Editor;
  selectedAnnotationId: string | null;
}

export function AnnotatedFigureWorkspace({
  annotations,
  canvas,
  captionEditorExtensions,
  figureId,
  onAddAnnotation,
  onDeleteAnnotation,
  onMoveAnnotation,
  onReplaceImage,
  onSelectAnnotation,
  outerEditor,
  selectedAnnotationId,
}: AnnotatedFigureWorkspaceProps) {
  const [workspaceElement, setWorkspaceElement] = useState<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const editorId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const selectedAnnotation = annotations.find(({ id }) => id === selectedAnnotationId) ?? null;
  const captionTarget = useMemo(
    () =>
      selectedAnnotationId
        ? createAnnotatedFigureCaptionTarget({
            annotationId: selectedAnnotationId,
            editor: outerEditor,
            figureId,
          })
        : null,
    [figureId, outerEditor, selectedAnnotationId],
  );

  useEffect(() => {
    if (!selectedAnnotationId) return;
    const selectedRow = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-workspace-annotation-id]") ?? [],
    ).find((row) => row.dataset["workspaceAnnotationId"] === selectedAnnotationId);
    selectedRow?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [annotations, selectedAnnotationId]);

  return (
    <WorkspaceDialog.Content
      ref={setWorkspaceElement}
      className="sc-annotated-figure-workspace"
      contentEditable={false}
      size="large"
    >
      <WorkspaceDialog.Header>
        <div>
          <WorkspaceDialog.Title>Edit annotated figure</WorkspaceDialog.Title>
          <WorkspaceDialog.Description>
            {annotations.length} annotation{annotations.length === 1 ? "" : "s"} · Position pins and
            manage their captions.
          </WorkspaceDialog.Description>
        </div>
        <WorkspaceDialog.Close aria-label="Close annotated figure workspace" />
      </WorkspaceDialog.Header>
      <AnnotatedFigureToolbar onAddAnnotation={onAddAnnotation} onReplaceImage={onReplaceImage} />
      <MediaWorkspace.Root>
        <MediaWorkspace.Canvas
          className="sc-annotated-figure-workspace__canvas-panel"
          aria-label="Annotation canvas"
        >
          {canvas}
        </MediaWorkspace.Canvas>
        <MediaWorkspace.Sidebar aria-label="Caption management">
          <MediaWorkspace.SidebarHeader
            title="Captions"
            description="Select a pin or row to edit its caption."
            count={annotations.length}
            countLabel={`${annotations.length} total annotations`}
          />
          {annotations.length > 0 ? (
            <MediaWorkspace.List ref={listRef} aria-label="Annotation captions">
              {annotations.map((annotation, index) => {
                const selected = annotation.id === selectedAnnotation?.id;
                const previous = annotations[index - 1];
                const next = annotations[index + 1];

                return (
                  <MediaWorkspace.Item
                    key={annotation.id}
                    selected={selected}
                    data-workspace-annotation-id={annotation.id}
                  >
                    <MediaWorkspace.ItemHeader>
                      <MediaWorkspace.ItemSelect
                        aria-label={`Select annotation ${annotation.number} caption`}
                        aria-pressed={selected}
                        onClick={() => onSelectAnnotation(annotation.id)}
                      >
                        <MediaWorkspace.ItemNumber aria-hidden>
                          {annotation.number}
                        </MediaWorkspace.ItemNumber>
                        <span>
                          {selected ? "Editing caption" : `Annotation ${annotation.number}`}
                        </span>
                      </MediaWorkspace.ItemSelect>
                      <div
                        className="sc-annotated-figure-workspace__row-actions"
                        role="group"
                        aria-label={`Reorder and delete workspace annotation ${annotation.number}`}
                      >
                        <button
                          type="button"
                          disabled={!previous}
                          aria-label={`Move workspace annotation ${annotation.number} previous`}
                          onClick={() => {
                            if (previous) {
                              onMoveAnnotation(annotation.id, "previous", previous.id);
                            }
                          }}
                        >
                          <CaretUp size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={!next}
                          aria-label={`Move workspace annotation ${annotation.number} next`}
                          onClick={() => {
                            if (next) onMoveAnnotation(annotation.id, "next", next.id);
                          }}
                        >
                          <CaretDown size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="sc-annotated-figure-workspace__row-delete"
                          aria-label={`Delete workspace annotation ${annotation.number}`}
                          onClick={() => onDeleteAnnotation(annotation.id)}
                        >
                          <X size={16} aria-hidden />
                        </button>
                      </div>
                    </MediaWorkspace.ItemHeader>
                    {selected && captionTarget ? (
                      <div className="sc-annotated-figure-workspace__caption-editor">
                        <RichTextArea
                          key={annotation.id}
                          ariaLabel={`Annotation ${annotation.number} caption`}
                          autoFocus
                          bubbleMenuAppendTo={() => workspaceElement}
                          bubbleMenuPluginKey={`annotated-figure-workspace-caption-${editorId}`}
                          className="sc-annotated-figure-workspace__caption-field"
                          extensions={captionEditorExtensions}
                          fieldKey={`annotation:${annotation.id}:caption`}
                          outerEditor={outerEditor}
                          placeholder="Describe this annotation"
                          syncKey={annotation.captionNode}
                          target={captionTarget}
                        />
                      </div>
                    ) : (
                      <div className="sc-annotated-figure-workspace__caption-preview">
                        {annotation.captionNode.content.size > 0
                          ? renderRuntimeRichTextNode(
                              annotation.captionNode.toJSON(),
                              `annotation-caption:${annotation.id}`,
                            )
                          : "No caption yet"}
                      </div>
                    )}
                  </MediaWorkspace.Item>
                );
              })}
            </MediaWorkspace.List>
          ) : (
            <MediaWorkspace.Empty>
              <strong>No annotations yet</strong>
              <span>Add an annotation to create its caption.</span>
            </MediaWorkspace.Empty>
          )}
        </MediaWorkspace.Sidebar>
      </MediaWorkspace.Root>
    </WorkspaceDialog.Content>
  );
}
