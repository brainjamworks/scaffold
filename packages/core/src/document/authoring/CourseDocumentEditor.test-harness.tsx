import type { JSONContent } from "@tiptap/core";
import { useEffect, useMemo } from "react";

import { createCourseDocumentAuthoringEnvironment } from "@/composition/authoring/create-authoring-composition";
import type { ScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import type {
  AuthoringDocumentEstablishmentResult,
  UnavailableContentRef,
} from "@/document/model/establishment";
import { prepareCourseDocumentAuthoringMount } from "./prepared-authoring-mount";
import {
  CourseDocumentEditor as PreparedCourseDocumentEditor,
  type CourseDocumentEditorProps as PreparedCourseDocumentEditorProps,
} from "./CourseDocumentEditor";

type PreparationFailure = Extract<
  AuthoringDocumentEstablishmentResult,
  { readonly status: "invalid" | "requires-scaffold-plus" | "unsupported-core-format" }
>;

const coreProductAccess = Object.freeze({ scaffoldPlusAuthorized: false });

export interface CourseDocumentEditorTestHarnessProps extends Omit<
  PreparedCourseDocumentEditorProps,
  "mount" | "onDocumentError" | "onUpdate"
> {
  readonly editable?: boolean;
  readonly composition: ScaffoldAuthoringComposition;
  readonly source: {
    readonly mode: "document";
    readonly content: JSONContent;
    readonly onUpdate?: (
      json: JSONContent,
      unavailableContent: readonly UnavailableContentRef[],
      sourceDocument: object,
    ) => void;
  };
  readonly onDocumentError?: (
    failure:
      | PreparationFailure
      | Parameters<NonNullable<PreparedCourseDocumentEditorProps["onDocumentError"]>>[0],
  ) => void;
}

export function CourseDocumentEditor({
  composition,
  editable = true,
  source,
  onDocumentError,
  ...props
}: CourseDocumentEditorTestHarnessProps) {
  const environment = useMemo(
    () => createCourseDocumentAuthoringEnvironment({ composition, editable }),
    [composition, editable],
  );
  const prepared = useMemo(
    () => prepareCourseDocumentAuthoringMount(source.content, environment, coreProductAccess),
    [environment, source.content],
  );

  useEffect(() => {
    if (
      prepared.status === "invalid" ||
      prepared.status === "requires-scaffold-plus" ||
      prepared.status === "unsupported-core-format"
    ) {
      onDocumentError?.(prepared);
    }
  }, [onDocumentError, prepared]);

  if (
    prepared.status === "invalid" ||
    prepared.status === "requires-scaffold-plus" ||
    prepared.status === "unsupported-core-format"
  )
    return null;

  return (
    <PreparedCourseDocumentEditor
      {...props}
      mount={prepared.mount}
      {...(source.onUpdate ? { onUpdate: source.onUpdate } : {})}
      {...(onDocumentError ? { onDocumentError } : {})}
    />
  );
}
