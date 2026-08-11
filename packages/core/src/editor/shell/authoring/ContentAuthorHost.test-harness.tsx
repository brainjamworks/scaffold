import type { JSONContent } from "@tiptap/core";
import { useMemo } from "react";

import { createCourseDocumentAuthoringEnvironment } from "@/composition/authoring/create-authoring-composition";
import type { ScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { prepareCourseDocumentAuthoringMount } from "@/document/authoring/prepared-authoring-mount";
import {
  ContentAuthorHost as PreparedContentAuthorHost,
  type ContentAuthorHostProps as PreparedContentAuthorHostProps,
} from "./ContentAuthorHost";

const coreProductAccess = Object.freeze({ scaffoldPlusAuthorized: false });

export interface ContentAuthorHostTestHarnessProps extends Omit<
  PreparedContentAuthorHostProps,
  "mount"
> {
  readonly composition: ScaffoldAuthoringComposition;
  readonly content: JSONContent;
  readonly editable?: boolean;
}

export function ContentAuthorHost({
  composition,
  content,
  editable = true,
  ...props
}: ContentAuthorHostTestHarnessProps) {
  const environment = useMemo(
    () => createCourseDocumentAuthoringEnvironment({ composition, editable }),
    [composition, editable],
  );
  const prepared = useMemo(
    () => prepareCourseDocumentAuthoringMount(content, environment, coreProductAccess),
    [content, environment],
  );

  if (
    prepared.status === "invalid" ||
    prepared.status === "requires-scaffold-plus" ||
    prepared.status === "unsupported-core-format"
  )
    return null;
  return <PreparedContentAuthorHost {...props} mount={prepared.mount} />;
}
