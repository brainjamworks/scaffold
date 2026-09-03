import { Extension } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FilePickerResult } from "@/editor/media/authoring/picker/LazyFilePickerModal";
import { FilePickerModal } from "@/editor/media/authoring/picker/LazyFilePickerModal";
import { createEmbeddedDataId } from "@/document/model/identity/stable-ids";
import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";
import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";
import { useAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import {
  DragDropCanvasDataSchema,
  DragDropPrivateAssessmentSchema,
  type DragDropCanvasData,
  type ImageBlockAttrs,
  type MarkerVisual,
} from "@scaffold/contracts";
import type { MediaPort } from "@/host/ports/media";
import type { CheckedMutationIssue } from "@/document/model/commands/checked-transactions";

import {
  createDragDropMarkerChecked,
  deleteDragDropMarkerChecked,
  reorderDragDropMarkersChecked,
  setDragDropBackgroundChecked,
  setDragDropCorrectPlacementChecked,
  setDragDropDefaultMarkerVisualChecked,
  updateDragDropMarkerChecked,
  type DragDropAuthoringIssue,
} from "./drag-drop-authoring-commands";
import { DragDropAuthoringCanvas } from "./drag-drop-canvas-authoring";
import { createDragDropCanvasNode } from "./drag-drop-canvas-shared";
import { dragDropBlockDefinition, dragDropConfiguration } from "./drag-drop-definition";
import { DragDropAuthoringWorkspace } from "./DragDropAuthoringWorkspace";
import { createDragDropNode } from "./node";
import { isDragDropOwnerNodeType } from "./node";

export { dragDropConfiguration };

function DragDropAuthoringView(props: NodeViewProps) {
  return (
    <AssessmentProblemContent editable blockClass="sc-course-drag-drop" nodeViewProps={props} />
  );
}

function DragDropCanvasAuthoringView(props: NodeViewProps) {
  const mediaPort = useMediaPort();
  const canvasPos = safeGetPos(props.getPos);
  const owner =
    typeof canvasPos === "number" ? findOwner(props.editor.state.doc.resolve(canvasPos)) : null;
  const ownerId = typeof owner?.node.attrs["id"] === "string" ? owner.node.attrs["id"] : null;
  const target = useAuthoringNodeTarget(
    props.editor,
    ownerId && owner ? { id: ownerId, nodeType: owner.node.type.name } : null,
  );
  const rawData = props.node.attrs["data"];
  const rawAssessment = owner?.node.attrs["assessment"];
  const data = useMemo(() => DragDropCanvasDataSchema.parse(rawData), [rawData]);
  const assessment = useMemo(
    () => DragDropPrivateAssessmentSchema.parse(rawAssessment),
    [rawAssessment],
  );
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [pickerKind, setPickerKind] = useState<"background" | "custom" | null>(null);
  const [reload, setReload] = useState(0);
  const customApply = useRef<((visual: Extract<MarkerVisual, { kind: "custom" }>) => void) | null>(
    null,
  );
  const [customSources, setCustomSources] = useState<Record<string, string>>({});
  const [authoringIssue, setAuthoringIssue] = useState<DragDropAuthoringPresentationIssue | null>(
    null,
  );
  const customMediaIds = useMemo(() => managedCustomIconIds(data), [data]);

  useEffect(() => {
    let current = true;
    setMediaError(false);
    if (data.image === null) {
      setImageSrc(null);
      return () => {
        current = false;
      };
    }
    if (data.image.mode === "external") {
      setImageSrc(data.image.src);
      return () => {
        current = false;
      };
    }
    void mediaPort
      ?.resolve(data.image.mediaId)
      .then((url) => {
        if (current) setImageSrc(url);
      })
      .catch(() => {
        if (current) setMediaError(true);
      });
    return () => {
      current = false;
    };
  }, [data.image, mediaPort, reload]);

  useEffect(() => {
    let current = true;
    if (customMediaIds.length === 0) {
      setCustomSources({});
      return () => {
        current = false;
      };
    }
    void resolveDragDropCustomIconSources(customMediaIds, mediaPort).then((sources) => {
      if (current) setCustomSources(sources);
    });
    return () => {
      current = false;
    };
  }, [customMediaIds, mediaPort]);

  const transact = (mutation: Parameters<NonNullable<typeof target>["transact"]>[0]) => {
    if (!target) {
      setAuthoringIssue({
        code: "drag_drop_authoring_unavailable",
        message: "This Drag and Drop question is no longer available for editing.",
        ownerId,
      });
      return;
    }
    const result = target.transact(mutation);
    if (!result.ok) {
      setAuthoringIssue(expectedAuthoringIssue(result.issue));
      return;
    }
    setAuthoringIssue(null);
  };

  const applyBackground = async (result: FilePickerResult) => {
    const picked = managedPick(result);
    if (!picked) return;
    let dimensions: { width: number; height: number };
    try {
      dimensions = await decodeImage(picked.url);
    } catch (cause) {
      setAuthoringIssue({
        code: "drag_drop_background_decode_failed",
        message: "The selected background image could not be read. Choose another image.",
        cause,
      });
      return;
    }
    transact((tr, resolved) =>
      setDragDropBackgroundChecked({
        tr,
        target: resolved,
        resolution: {
          kind: "resolved",
          image: picked.image,
          width: dimensions.width,
          height: dimensions.height,
        },
      }),
    );
  };

  const authoringCanvas = (
    <DragDropAuthoringCanvas
      data={data}
      assessment={assessment}
      imageSrc={imageSrc}
      mediaError={mediaError}
      onRequestBackground={() => setPickerKind("background")}
      onRetryBackground={() => setReload((value) => value + 1)}
      onCreateMarker={(draft, geometry) =>
        transact((tr, resolved) =>
          createDragDropMarkerChecked({
            tr,
            target: resolved,
            draft,
            geometry,
            createMarkerId: createEmbeddedDataId,
          }),
        )
      }
      onUpdateMarker={(markerId, patch) =>
        transact((tr, resolved) =>
          updateDragDropMarkerChecked({ tr, target: resolved, markerId, patch }),
        )
      }
      onReorderMarkers={(markerIds) =>
        transact((tr, resolved) =>
          reorderDragDropMarkersChecked({ tr, target: resolved, markerIds }),
        )
      }
      onSetCorrectPlacement={(markerId, geometry) =>
        transact((tr, resolved) =>
          setDragDropCorrectPlacementChecked({ tr, target: resolved, markerId, geometry }),
        )
      }
      onDeleteMarker={(markerId) =>
        transact((tr, resolved) => deleteDragDropMarkerChecked({ tr, target: resolved, markerId }))
      }
      onSetDefaultMarkerVisual={(visual) =>
        transact((tr, resolved) =>
          setDragDropDefaultMarkerVisualChecked({ tr, target: resolved, visual }),
        )
      }
      onRequestCustomIcon={(apply) => {
        customApply.current = apply;
        setPickerKind("custom");
      }}
      customIconSrc={(mediaId) => customSources[mediaId] ?? null}
    />
  );

  return (
    <NodeViewWrapper data-node="drag-drop-canvas" contentEditable={false}>
      {authoringIssue ? (
        <p role="alert" data-drag-drop-authoring-issue={authoringIssue.code}>
          {authoringIssue.message}
        </p>
      ) : null}
      <DragDropAuthoringWorkspace.Root>
        {authoringCanvas}
        <DragDropAuthoringWorkspace.Trigger asChild>
          <button type="button">Open Drag and Drop workspace</button>
        </DragDropAuthoringWorkspace.Trigger>
        <DragDropAuthoringWorkspace.Content
          title="Drag and Drop"
          description="Place and manage markers on the background image."
        >
          {authoringCanvas}
        </DragDropAuthoringWorkspace.Content>
      </DragDropAuthoringWorkspace.Root>
      <FilePickerModal
        open={pickerKind !== null}
        onOpenChange={(open) => {
          if (!open) setPickerKind(null);
        }}
        kind="media"
        allowedMediaTypes={["image"]}
        defaultMediaType="image"
        allowExternalUrl={false}
        title={pickerKind === "custom" ? "Choose marker icon" : "Choose background image"}
        onResolved={(result) => {
          if (pickerKind === "background") {
            void applyBackground(result);
            return;
          }
          const picked = managedPick(result);
          if (!picked) return false;
          setCustomSources((current) => ({ ...current, [picked.image.mediaId]: picked.url }));
          customApply.current?.({
            kind: "custom",
            source: { mode: "managed", mediaId: picked.image.mediaId },
          });
        }}
      />
    </NodeViewWrapper>
  );
}

const DragDropAuthoringNode = createDragDropNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-assessment-node-view",
      definition: dragDropBlockDefinition,
      view: { component: DragDropAuthoringView },
    }),
});

const DragDropCanvasAuthoringNode = createDragDropCanvasNode({
  addNodeView: () => ReactNodeViewRenderer(DragDropCanvasAuthoringView),
});

export const DragDropAuthoringExtension = Extension.create({
  name: "drag_drop_authoring_bundle",
  addExtensions() {
    return [DragDropCanvasAuthoringNode, DragDropAuthoringNode];
  },
});

function findOwner($pos: ReturnType<NodeViewProps["editor"]["state"]["doc"]["resolve"]>) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (isDragDropOwnerNodeType(node.type.name)) return { node, pos: $pos.before(depth) };
  }
  return null;
}

function managedPick(
  result: FilePickerResult,
): { image: Extract<ImageBlockAttrs, { mode: "managed" }>; url: string } | null {
  const selected =
    result.source === "upload" ? result.upload : result.source === "browse" ? result.browse : null;
  if (!selected || selected.mediaType !== "image") return null;
  return {
    image: {
      mode: "managed",
      mediaId: selected.id,
      alt: result.alt?.trim() || result.title?.trim() || selected.fileName,
    },
    url: selected.url,
  };
}

export function decodeImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      } else reject(new Error("The selected background has no intrinsic image dimensions."));
    };
    image.onerror = () => reject(new Error("The selected background image could not be decoded."));
    image.src = src;
  });
}

type DragDropAuthoringPresentationIssue =
  | DragDropAuthoringIssue
  | Readonly<{
      code: "missing_authoring_target" | "invalid_authoring_target" | "destroyed_authoring_editor";
      message: string;
      field?: string;
    }>
  | Readonly<{
      code: "drag_drop_authoring_unavailable";
      message: string;
      ownerId: string | null;
    }>
  | Readonly<{
      code: "drag_drop_background_decode_failed";
      message: string;
      cause: unknown;
    }>;

export function managedCustomIconIds(data: DragDropCanvasData): string[] {
  const visuals = [
    data.defaultMarkerVisual,
    ...data.markers.map(({ visualOverride }) => visualOverride),
  ];
  return Array.from(
    new Set(
      visuals.flatMap((visual) => (visual?.kind === "custom" ? [visual.source.mediaId] : [])),
    ),
  );
}

export async function resolveDragDropCustomIconSources(
  mediaIds: readonly string[],
  mediaPort: MediaPort | null,
): Promise<Record<string, string>> {
  if (!mediaPort) return {};
  const entries = await Promise.all(
    mediaIds.map(async (mediaId) => {
      try {
        return [mediaId, await mediaPort.resolve(mediaId)] as const;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

export function expectedAuthoringIssue(
  issue: CheckedMutationIssue,
): DragDropAuthoringPresentationIssue {
  switch (issue.code) {
    case "stale_drag_drop_owner":
    case "missing_drag_drop_marker":
    case "drag_drop_background_cancelled":
    case "missing_authoring_target":
    case "invalid_authoring_target":
    case "destroyed_authoring_editor":
      return issue as DragDropAuthoringPresentationIssue;
    default:
      throw new Error(`Unexpected Drag and Drop authoring issue "${issue.code}".`);
  }
}
