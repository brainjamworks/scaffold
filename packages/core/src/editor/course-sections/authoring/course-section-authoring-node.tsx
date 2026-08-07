import { CourseSectionTitleSchema, EmbeddedNodeIdSchema } from "@scaffold/contracts";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

import { createCourseSectionNode } from "@/document/model/nodes";
import { readCourseSectionOrdinalContext } from "@/document/model/course-structure";
import type { CourseSectionId } from "@/document/model/course-structure/types";
import { Button } from "@/ui/components/Button/Button";
import * as Dialog from "@/ui/components/Dialog/Dialog";
import { Field, FieldError, Input, Label } from "@/ui/components/Input/Input";
import { zIndex } from "@/ui/overlays/z-index";

import "./course-section-dialog.css";

interface RenameRequest {
  readonly courseSectionId: CourseSectionId;
  readonly originalTitle: string;
}

export function createCourseSectionAuthoringNode() {
  return createCourseSectionNode({
    addNodeView: () => ReactNodeViewRenderer(CourseSectionAuthoringNodeView),
  });
}

function CourseSectionAuthoringNodeView({ editor, node, selected }: NodeViewProps) {
  const title = CourseSectionTitleSchema.parse(node.attrs["title"]);
  const parsedSectionId = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
  const courseSectionId = parsedSectionId.success ? parsedSectionId.data : null;
  const ordinalContext = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      courseSectionId
        ? readCourseSectionOrdinalContext(currentEditor.state.doc, courseSectionId)
        : null,
  });
  const isEditable = useEditorEditability(editor);
  const accessibleLabel = ordinalContext
    ? `${title}, Course Section ${ordinalContext.number} of ${ordinalContext.count}`
    : `Course Section: ${title}`;
  const [renameRequest, setRenameRequest] = useState<RenameRequest | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const titleInputId = useId();
  const titleErrorId = useId();

  useEffect(() => {
    if (isEditable) return;
    setRenameRequest(null);
    setRenameError(null);
    setActionError(null);
  }, [isEditable]);

  const openRenameDialog = () => {
    if (!editor.isEditable) return;
    if (!parsedSectionId.success) {
      setActionError("This Course Section cannot be changed because its identity is invalid.");
      return;
    }
    setActionError(null);
    setRenameError(null);
    setRenameTitle(title);
    setRenameRequest({ courseSectionId: parsedSectionId.data, originalTitle: title });
  };

  const closeRenameDialog = () => {
    setRenameRequest(null);
    setRenameError(null);
  };

  const renameCourseSection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor.isEditable) {
      closeRenameDialog();
      return;
    }
    if (!renameRequest) return;

    const parsedTitle = CourseSectionTitleSchema.safeParse(renameTitle);
    if (!parsedTitle.success) {
      setRenameError("Enter a Course Section title.");
      return;
    }
    if (parsedTitle.data === renameRequest.originalTitle) {
      setRenameError("Enter a different Course Section title.");
      return;
    }

    const command = {
      type: "course-section.rename" as const,
      courseSectionId: renameRequest.courseSectionId,
      title: parsedTitle.data,
    };
    if (!editor.can().applyCourseStructureCommand(command)) {
      setRenameError("This Course Section could not be renamed. The document may have changed.");
      return;
    }
    const applied = editor
      .chain()
      .focus()
      .applyCourseStructureCommand(command)
      .scrollIntoView()
      .run();
    if (!applied) {
      setRenameError("This Course Section could not be renamed. The document may have changed.");
      return;
    }
    closeRenameDialog();
  };

  const removeCourseSection = () => {
    if (!editor.isEditable) return;
    if (!parsedSectionId.success) {
      setActionError("This Course Section cannot be changed because its identity is invalid.");
      return;
    }
    const command = {
      type: "course-section.remove" as const,
      courseSectionId: parsedSectionId.data,
    };
    if (!editor.can().applyCourseStructureCommand(command)) {
      setActionError("This Course Section could not be removed. The document may have changed.");
      return;
    }
    const applied = editor
      .chain()
      .focus()
      .applyCourseStructureCommand(command)
      .scrollIntoView()
      .run();
    if (!applied) {
      setActionError("This Course Section could not be removed. The document may have changed.");
    }
  };

  const duplicateCourseSection = () => {
    if (!editor.isEditable) return;
    if (!parsedSectionId.success) {
      setActionError("This Course Section cannot be changed because its identity is invalid.");
      return;
    }
    const command = {
      type: "course-section.duplicate" as const,
      courseSectionId: parsedSectionId.data,
    };
    if (!editor.can().applyCourseStructureCommand(command)) {
      setActionError("This Course Section could not be duplicated. The document may have changed.");
      return;
    }
    const applied = editor
      .chain()
      .focus()
      .applyCourseStructureCommand(command)
      .scrollIntoView()
      .run();
    if (!applied) {
      setActionError("This Course Section could not be duplicated. The document may have changed.");
    }
  };

  return (
    <>
      <NodeViewWrapper
        aria-label={accessibleLabel}
        className="sc-course-section-authoring"
        contentEditable={false}
        data-course-section-authoring=""
        data-selected={selected ? "true" : undefined}
        role="group"
      >
        <span className="sc-course-section-authoring__kind">Course Section</span>
        <h2 className="sc-course-section-authoring__title">{title}</h2>
        {isEditable ? (
          <div className="sc-course-section-authoring__controls">
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Rename ${accessibleLabel}`}
              onClick={openRenameDialog}
            >
              Rename Course Section
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Duplicate ${accessibleLabel}`}
              onClick={duplicateCourseSection}
            >
              Duplicate Course Section
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove ${accessibleLabel}`}
              onClick={removeCourseSection}
            >
              Remove Course Section
            </Button>
          </div>
        ) : null}
        {isEditable && actionError ? (
          <FieldError className="sc-course-section-authoring__error">{actionError}</FieldError>
        ) : null}
      </NodeViewWrapper>

      <Dialog.Root
        open={isEditable && renameRequest !== null}
        onOpenChange={(open) => {
          if (!open) closeRenameDialog();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            className="sc-course-section-dialog__overlay"
            style={{ zIndex: zIndex.modalBackdrop }}
          />
          <Dialog.Content
            className="sc-course-section-dialog"
            style={{ zIndex: zIndex.modal }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (!editor.isDestroyed) editor.view.focus();
            }}
          >
            <Dialog.Title className="sc-course-section-dialog__title">
              Rename Course Section
            </Dialog.Title>
            <Dialog.Description className="sc-course-section-dialog__description">
              Change the boundary title without changing its slides or identity.
            </Dialog.Description>

            <form className="sc-course-section-dialog__form" onSubmit={renameCourseSection}>
              <Field>
                <Label htmlFor={titleInputId}>Course Section title</Label>
                <Input
                  id={titleInputId}
                  aria-describedby={renameError ? titleErrorId : undefined}
                  autoComplete="off"
                  invalid={Boolean(renameError)}
                  maxLength={200}
                  value={renameTitle}
                  onChange={(event) => {
                    setRenameTitle(event.currentTarget.value);
                    setRenameError(null);
                  }}
                />
                {renameError ? <FieldError id={titleErrorId}>{renameError}</FieldError> : null}
              </Field>

              <div className="sc-course-section-dialog__actions">
                <Button type="button" variant="secondary" onClick={closeRenameDialog}>
                  Cancel
                </Button>
                <Button type="submit">Rename Course Section</Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function useEditorEditability(editor: NodeViewProps["editor"]): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      editor.on("update", notify);
      return () => editor.off("update", notify);
    },
    [editor],
  );
  const getSnapshot = useCallback(() => editor.isEditable, [editor]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
