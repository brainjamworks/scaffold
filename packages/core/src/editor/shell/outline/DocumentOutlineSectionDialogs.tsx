import { CourseSectionTitleSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";

import type { SemanticItem } from "@/document/model/semantic-document";
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

export type CourseSectionDialogRequest =
  | { readonly kind: "create" }
  | { readonly kind: "rename"; readonly item: SemanticItem }
  | {
      readonly kind: "delete";
      readonly item: SemanticItem;
      readonly surfaceIds: readonly EmbeddedNodeId[];
      readonly surfaceLabels: readonly string[];
    }
  | null;

export function DocumentOutlineSectionDialogs({
  overlayBoundary,
  port,
  request,
  onClose,
  onResult,
}: {
  readonly overlayBoundary?: OverlayBoundaryResolution;
  readonly port: CourseOutlineStructureAuthoringPort;
  readonly request: CourseSectionDialogRequest;
  readonly onClose: () => void;
  readonly onResult: (result: CourseOutlineStructureResult, successMessage: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [displayedRequest, setDisplayedRequest] = useState<Exclude<
    CourseSectionDialogRequest,
    null
  > | null>(request);
  const titleId = useId();

  useEffect(() => {
    if (!request) return;
    setDisplayedRequest(request);
    setTitle(request.kind === "rename" ? request.item.label : "");
    setTitleError(null);
  }, [request]);

  const renderedRequest = request ?? displayedRequest;

  const submitTitle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!request || request.kind === "delete") return;
    const parsedTitle = CourseSectionTitleSchema.safeParse(title);
    setTitleError(parsedTitle.success ? null : "Enter a Course Section title.");
    if (!parsedTitle.success) return;
    const result =
      request.kind === "create"
        ? port.createCourseSection(parsedTitle.data)
        : port.renameCourseSection({
            courseSectionId: request.item.id,
            title: parsedTitle.data,
          });
    onResult(
      result,
      request.kind === "create" ? "Course Section added." : "Course Section title updated.",
    );
    if (result.ok) onClose();
  };

  const confirmDelete = () => {
    if (!request || request.kind !== "delete") return;
    const result = port.deleteCourseSection({
      courseSectionId: request.item.id,
      expectedSurfaceIds: request.surfaceIds,
    });
    onResult(result, "Course Section and related Surfaces deleted.");
    if (result.ok) onClose();
  };

  const dialogTitle =
    renderedRequest?.kind === "create"
      ? "Add Course Section"
      : renderedRequest?.kind === "delete"
        ? "Delete Course Section"
        : "Edit Course Section title";

  return (
    <AppDialog.Root open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <SectionDialogBoundary overlayBoundary={overlayBoundary}>
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
                : renderedRequest?.kind === "create"
                  ? "Add a genuinely empty Course Section to the end of this Slideshow."
                  : "Change the canonical Course Section title."}
            </AppDialog.Description>
          </AppDialog.Header>
          {renderedRequest?.kind === "delete" ? (
            <>
              <AppDialog.Body>
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
                  {renderedRequest?.kind === "create"
                    ? "Add Course Section"
                    : "Save Course Section title"}
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
  children,
  overlayBoundary,
}: {
  readonly children: ReactNode;
  readonly overlayBoundary?: OverlayBoundaryResolution;
}) {
  return overlayBoundary ? (
    <OverlayBoundaryResolutionProvider resolution={overlayBoundary}>
      {children}
    </OverlayBoundaryResolutionProvider>
  ) : (
    children
  );
}
