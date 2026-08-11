import {
  getSchema,
  type Editor as TiptapEditor,
  type Extensions,
  type JSONContent,
} from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo } from "react";

import { readSurfaceViewSettings } from "@/document/model/surface-view-settings";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import type { ScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import type { ScaffoldLearnerPublication } from "@/host/contracts";
import type { ScaffoldProductAccess } from "@/host/contracts/product-access";
import { establishAuthoringDocument } from "@/document/model/establishment/establish-authoring-document";

import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import {
  RuntimeSurfaceVisibility,
  type RuntimeSurfaceStateMap,
  setRuntimeSurfaceStates,
  setRuntimeVisibleSurfaceId,
} from "./runtime-surface-visibility";
import { RuntimeSurfacePresentationProvider } from "./runtime-surface-presentation";
import { RuntimeSurfaceView } from "@/editor/surfaces/runtime/views/RuntimeSurfaceView";
import "./CourseDocumentRuntimeRenderer.css";

export interface CourseDocumentRuntimeRendererProps {
  artifactId?: string | null;
  composition: ScaffoldRuntimeComposition;
  initialContent?: JSONContent | null;
  productAccess: ScaffoldProductAccess;
  onReady?: (editor: TiptapEditor) => void;
  surfaceStates?: RuntimeSurfaceStateMap;
  visibleSurfaceId?: string;
}

const PREPARED_RUNTIME_DOCUMENT = Symbol("PreparedRuntimeDocument");

export interface PreparedRuntimeDocument {
  readonly [PREPARED_RUNTIME_DOCUMENT]: true;
  readonly composition: ScaffoldRuntimeComposition;
  readonly content: JSONContent;
}

export interface PreparedCourseDocumentRuntimeRendererProps {
  artifactId?: string | null;
  preparedDocument: PreparedRuntimeDocument;
  onReady?: (editor: TiptapEditor) => void;
  surfaceStates?: RuntimeSurfaceStateMap;
  visibleSurfaceId?: string;
}

export type RuntimeDocumentReadiness =
  | { readonly status: "supported"; readonly preparedDocument: PreparedRuntimeDocument }
  | { readonly status: "missing-content" }
  | { readonly status: "not-published" }
  | { readonly status: "unavailable-content" }
  | { readonly status: "requires-scaffold-plus" }
  | {
      readonly status: "invalid-learner-content";
      readonly issues?: readonly { readonly code: string; readonly message: string }[];
    }
  | {
      readonly status: "unsupported-core-format";
      readonly documentVersion: number;
      readonly supportedVersion: number;
      readonly message: string;
    };

export function checkRuntimeDocumentReadiness(
  initialContent: JSONContent | null | undefined,
  composition: ScaffoldRuntimeComposition,
  productAccess: ScaffoldProductAccess,
): RuntimeDocumentReadiness {
  if (!initialContent) return { status: "missing-content" };

  const established = establishAuthoringDocument({
    canonicalDocument: initialContent,
    capabilities: {
      blocks: composition.capabilities.blocks.registry,
      layouts: composition.capabilities.layouts.registry,
      surfaces: composition.capabilities.surfaces.registry,
    },
    authoringSchema: getSchema(createRuntimeExtensions(composition)),
    productAccess,
  });
  if (
    established.status === "requires-scaffold-plus" ||
    established.status === "unsupported-core-format"
  )
    return established;
  if (established.status !== "supported") {
    return {
      status: "invalid-learner-content",
      ...(established.status === "invalid" ? { issues: established.issues } : {}),
    };
  }

  return {
    status: "supported",
    preparedDocument: {
      [PREPARED_RUNTIME_DOCUMENT]: true,
      composition,
      content: established.workingDocument,
    },
  };
}

export function prepareRuntimeLearnerPublication(
  publication: ScaffoldLearnerPublication,
  composition: ScaffoldRuntimeComposition,
  productAccess: ScaffoldProductAccess,
): RuntimeDocumentReadiness {
  if (publication.status === "supported") {
    return checkRuntimeDocumentReadiness(publication.learnerContent, composition, productAccess);
  }
  if (publication.status === "invalid") return { status: "invalid-learner-content" };
  return publication;
}

export function CourseDocumentRuntimeRenderer({
  artifactId,
  composition,
  initialContent = null,
  onReady,
  productAccess,
  surfaceStates,
  visibleSurfaceId,
}: CourseDocumentRuntimeRendererProps) {
  const readiness = useMemo(
    () => checkRuntimeDocumentReadiness(initialContent, composition, productAccess),
    [composition, initialContent, productAccess],
  );
  if (readiness.status !== "supported") return null;

  return (
    <PreparedCourseDocumentRuntimeRenderer
      preparedDocument={readiness.preparedDocument}
      {...(artifactId === undefined ? {} : { artifactId })}
      {...(onReady === undefined ? {} : { onReady })}
      {...(surfaceStates === undefined ? {} : { surfaceStates })}
      {...(visibleSurfaceId === undefined ? {} : { visibleSurfaceId })}
    />
  );
}

export function PreparedCourseDocumentRuntimeRenderer({
  artifactId,
  preparedDocument,
  onReady,
  surfaceStates,
  visibleSurfaceId,
}: PreparedCourseDocumentRuntimeRendererProps) {
  const { composition, content: initialContent } = preparedDocument;
  const surfaceViewSettings = readSurfaceViewSettings(initialContent);
  const presentedSurfaceId = surfaceStates
    ? (Object.entries(surfaceStates).find(([, state]) => state === "current")?.[0] ?? null)
    : visibleSurfaceId;

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      editorProps: {
        attributes: {
          "aria-label": "Course content",
          role: "document",
        },
      },
      ...(initialContent ? { content: initialContent } : {}),
      extensions: createRuntimeExtensions(composition),
      onCreate: ({ editor: e }) => {
        onReady?.(e);
      },
    },
    [composition, initialContent],
  );

  useEffect(() => {
    if (!editor) return;

    if (surfaceStates) {
      setRuntimeSurfaceStates(editor, surfaceStates);
    } else {
      setRuntimeVisibleSurfaceId(editor, visibleSurfaceId);
    }
  }, [editor, surfaceStates, visibleSurfaceId]);

  if (!editor) {
    return null;
  }

  if (!surfaceViewSettings) {
    return null;
  }

  return (
    <div data-testid="course-document-runtime-renderer">
      <ScaffoldArtifactIdentityProvider artifactId={artifactId ?? null}>
        <RuntimeSurfaceView settings={surfaceViewSettings}>
          <RuntimeSurfacePresentationProvider surfaceId={presentedSurfaceId}>
            <EditorContent
              className="sc-course-document-runtime-renderer__content"
              editor={editor}
            />
          </RuntimeSurfacePresentationProvider>
        </RuntimeSurfaceView>
      </ScaffoldArtifactIdentityProvider>
    </div>
  );
}

function createRuntimeExtensions(composition: ScaffoldRuntimeComposition): Extensions {
  return [...createCourseDocumentRuntimeExtensions({ composition }), RuntimeSurfaceVisibility];
}
