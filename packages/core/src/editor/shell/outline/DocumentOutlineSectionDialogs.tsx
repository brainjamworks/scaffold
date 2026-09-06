import { CourseSectionTitleSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { DocumentTreeItem } from "@/document/model/document-tree";
import { AuthoringOverlayOwnership } from "@/editor/interactions/floating/AuthoringOverlayBoundary";
import { Button } from "@/ui/components/Button/Button";
import { Field, FieldError, Input, Label } from "@/ui/components/Input/Input";
import { AppDialog } from "@/ui/components/app/AppDialog/AppDialog";
import {
  OverlayBoundaryResolutionProvider,
  type OverlayBoundaryResolution,
} from "@/ui/overlays/portal-host-context";

import type {
  CourseOutlineStructureAuthoringPort,
  CourseOutlineStructureResult,
} from "./course-outline-structure-authoring";
import { courseOutlineStructureIssueMessage } from "./course-outline-structure-messages";

export type CourseSectionDialogRequest =
  | { readonly kind: "rename"; readonly item: DocumentTreeItem }
  | {
      readonly kind: "delete";
      readonly item: DocumentTreeItem;
      readonly surfaceIds: readonly EmbeddedNodeId[];
      readonly surfaceLabels: readonly string[];
    }
  | null;

export function DocumentOutlineSectionDialogs({
  interactionOwnerRoot,
  overlayBoundary,
  port,
  request,
  onClose,
  onDeleteScopeChange,
  onResult,
}: {
  readonly interactionOwnerRoot?: Element;
  readonly overlayBoundary?: OverlayBoundaryResolution;
  readonly port: CourseOutlineStructureAuthoringPort;
  readonly request: CourseSectionDialogRequest;
  readonly onClose: () => void;
  readonly onDeleteScopeChange: (surfaceIds: readonly EmbeddedNodeId[]) => void;
  readonly onResult: (result: CourseOutlineStructureResult, successMessage: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [displayedRequest, setDisplayedRequest] = useState<Exclude<
    CourseSectionDialogRequest,
    null
  > | null>(request);
  const dialogIdentity = useRef<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!request) {
      dialogIdentity.current = null;
      return;
    }
    setDisplayedRequest(request);
    const nextIdentity = `${request.kind}:${request.item.id}`;
    if (dialogIdentity.current === nextIdentity) return;
    dialogIdentity.current = nextIdentity;
    setTitle(request.kind === "rename" ? request.item.label : "");
    setTitleError(null);
    setDeleteError(null);
  }, [request]);

  const renderedRequest = request ?? displayedRequest;

  const submitTitle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!request || request.kind !== "rename") return;
    const parsedTitle = CourseSectionTitleSchema.safeParse(title);
    setTitleError(parsedTitle.success ? null : "Enter a Course Section title.");
    if (!parsedTitle.success) return;
    const result = port.renameCourseSection({
      courseSectionId: request.item.id,
      title: parsedTitle.data,
    });
    onResult(result, "Course Section title updated.");
    if (result.isOk()) onClose();
  };

  const confirmDelete = () => {
    if (!renderedRequest || renderedRequest.kind !== "delete") return;
    const result = port.deleteCourseSection({
      courseSectionId: renderedRequest.item.id,
      expectedSurfaceIds: renderedRequest.surfaceIds,
    });
    onResult(result, "Course Section and related Surfaces deleted.");
    if (result.isOk()) {
      onClose();
      return;
    }

    setDeleteError(courseOutlineStructureIssueMessage(result.error));
    if (result.error.code === "course_section_membership_changed") {
      onDeleteScopeChange(result.error.actualSurfaceIds);
    }
  };

  const dialogTitle =
    renderedRequest?.kind === "delete" ? "Delete Course Section" : "Edit Course Section title";

  return (
    <AppDialog.Root open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <SectionDialogBoundary
        active={request !== null}
        {...(interactionOwnerRoot ? { interactionOwnerRoot } : {})}
        {...(overlayBoundary ? { overlayBoundary } : {})}
      >
        <AppDialog.Content
          intent={renderedRequest?.kind === "delete" ? "danger" : "neutral"}
          role={renderedRequest?.kind === "delete" ? "alertdialog" : "dialog"}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <AppDialog.Header>
            <AppDialog.Title>{dialogTitle}</AppDialog.Title>
            <AppDialog.Description>
              {renderedRequest?.kind === "delete"
                ? `Deleting ${renderedRequest.item.label} will also delete its related Surfaces. This action can be undone.`
                : "Change the canonical Course Section title."}
            </AppDialog.Description>
          </AppDialog.Header>
          {renderedRequest?.kind === "delete" ? (
            <>
              <AppDialog.Body>
                {deleteError ? <FieldError>{deleteError}</FieldError> : null}
                <ul className="sc-document-outline-section-list" aria-label="Related Surfaces">
                  {renderedRequest.surfaceLabels.map((label, index) => (
                    <li key={renderedRequest.surfaceIds[index]}>{label}</li>
                  ))}
                </ul>
              </AppDialog.Body>
              <AppDialog.Actions>
                <Button type="button" size="lg" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="button" size="lg" variant="danger" onClick={confirmDelete}>
                  Delete Course Section
                </Button>
              </AppDialog.Actions>
            </>
          ) : (
            <form className="sc-document-outline-dialog-form" onSubmit={submitTitle}>
              <AppDialog.Body>
                <Field>
                  <Label htmlFor={titleId}>Course Section title</Label>
                  <Input
                    id={titleId}
                    autoComplete="off"
                    invalid={Boolean(titleError)}
                    maxLength={200}
                    value={title}
                    onChange={(event) => setTitle(event.currentTarget.value)}
                  />
                  {titleError ? <FieldError>{titleError}</FieldError> : null}
                </Field>
              </AppDialog.Body>
              <AppDialog.Actions>
                <Button type="button" size="lg" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" size="lg">
                  Save Course Section title
                </Button>
              </AppDialog.Actions>
            </form>
          )}
        </AppDialog.Content>
      </SectionDialogBoundary>
    </AppDialog.Root>
  );
}

function SectionDialogBoundary({
  active,
  children,
  interactionOwnerRoot,
  overlayBoundary,
}: {
  readonly active: boolean;
  readonly children: ReactNode;
  readonly interactionOwnerRoot?: Element;
  readonly overlayBoundary?: OverlayBoundaryResolution;
}) {
  return overlayBoundary ? (
    <OverlayBoundaryResolutionProvider resolution={overlayBoundary}>
      <AuthoringOverlayOwnership ownerRoot={active ? (interactionOwnerRoot ?? null) : null}>
        {children}
      </AuthoringOverlayOwnership>
    </OverlayBoundaryResolutionProvider>
  ) : (
    children
  );
}
