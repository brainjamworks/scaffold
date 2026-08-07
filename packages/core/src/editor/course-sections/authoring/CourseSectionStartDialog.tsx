import { CourseSectionTitleSchema } from "@scaffold/contracts";
import { useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useId, useState, type FormEvent } from "react";

import { readCourseSectionStartOptions } from "@/document/model/course-structure/course-section-start-options";
import {
  closeCourseSectionStartDialog,
  getAuthoringSlideDividersState,
} from "@/editor/surfaces/authoring/AuthoringSlideDividers";
import { Button } from "@/ui/components/Button/Button";
import * as Dialog from "@/ui/components/Dialog/Dialog";
import { Field, FieldError, Input, Label } from "@/ui/components/Input/Input";
import { zIndex } from "@/ui/overlays/z-index";

import "./course-section-dialog.css";

export function CourseSectionStartDialog({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const request = getAuthoringSlideDividersState(currentEditor.state).courseSectionStartRequest;
      const option = request
        ? readCourseSectionStartOptions(currentEditor.state.doc).find(
            (candidate) => candidate.atSurfaceId === request.atSurfaceId,
          )
        : undefined;
      return { option: option ?? null, request };
    },
  });
  const [title, setTitle] = useState("");
  const [leadingTitle, setLeadingTitle] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [leadingTitleError, setLeadingTitleError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const titleId = useId();
  const titleErrorId = useId();
  const leadingTitleId = useId();
  const leadingTitleErrorId = useId();

  useEffect(() => {
    setTitle("");
    setLeadingTitle("");
    setTitleError(null);
    setLeadingTitleError(null);
    setCommandError(null);
  }, [state.request?.atSurfaceId]);

  const close = () => closeCourseSectionStartDialog(editor.view);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!state.option) return;

    const parsedTitle = CourseSectionTitleSchema.safeParse(title);
    const parsedLeadingTitle = state.option.leadingTitleRequired
      ? CourseSectionTitleSchema.safeParse(leadingTitle)
      : null;
    setTitleError(parsedTitle.success ? null : "Enter a Course Section title.");
    setLeadingTitleError(
      parsedLeadingTitle?.success === false ? "Enter a leading Course Section title." : null,
    );
    setCommandError(null);
    if (!parsedTitle.success || parsedLeadingTitle?.success === false) return;

    const command = {
      type: "course-section.start" as const,
      atSurfaceId: state.option.atSurfaceId,
      title: parsedTitle.data,
      ...(parsedLeadingTitle?.success ? { leadingTitle: parsedLeadingTitle.data } : {}),
    };
    if (!editor.can().applyCourseStructureCommand(command)) {
      setCommandError("This Course Section could not be started. The document may have changed.");
      return;
    }
    const applied = editor
      .chain()
      .focus()
      .applyCourseStructureCommand(command)
      .scrollIntoView()
      .run();
    if (!applied) {
      setCommandError("This Course Section could not be started. The document may have changed.");
      return;
    }
    close();
  };

  return (
    <Dialog.Root
      open={state.request !== null}
      onOpenChange={(open) => {
        if (!open) close();
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
            Start Course Section
          </Dialog.Title>
          <Dialog.Description className="sc-course-section-dialog__description">
            Add a named structural boundary without changing any slide content.
          </Dialog.Description>

          <form className="sc-course-section-dialog__form" onSubmit={submit}>
            {state.option?.leadingTitleRequired ? (
              <Field>
                <Label htmlFor={leadingTitleId}>Leading Course Section title</Label>
                <Input
                  id={leadingTitleId}
                  aria-describedby={leadingTitleError ? leadingTitleErrorId : undefined}
                  autoComplete="off"
                  invalid={Boolean(leadingTitleError)}
                  maxLength={200}
                  value={leadingTitle}
                  onChange={(event) => setLeadingTitle(event.currentTarget.value)}
                />
                {leadingTitleError ? (
                  <FieldError id={leadingTitleErrorId}>{leadingTitleError}</FieldError>
                ) : null}
              </Field>
            ) : null}

            <Field>
              <Label htmlFor={titleId}>Course Section title</Label>
              <Input
                id={titleId}
                aria-describedby={titleError ? titleErrorId : undefined}
                autoComplete="off"
                invalid={Boolean(titleError)}
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
              {titleError ? <FieldError id={titleErrorId}>{titleError}</FieldError> : null}
            </Field>

            {!state.option ? (
              <FieldError>This Course Section location is no longer available.</FieldError>
            ) : null}
            {commandError ? <FieldError>{commandError}</FieldError> : null}

            <div className="sc-course-section-dialog__actions">
              <Button type="button" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={!state.option}>
                Start Course Section
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
