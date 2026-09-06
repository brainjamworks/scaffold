import { ArrowsClockwiseIcon as ArrowsClockwise, PlusIcon as Plus } from "@phosphor-icons/react";
import { Extension } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { resolveActiveBoundedPlacement } from "@/editor/bounded-containers/model/bounded-container-placement";
import { iconMd } from "@/ui/tokens/icon-sizes";
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
import { setTextSelectionNearInTransaction } from "@/editor/selection/selection-transactions";
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
import {
  createDragDropCanvasNode,
  defaultDragDropCanvasData,
} from "@/editor/assessment/drag-drop/drag-drop-canvas-shared";
import { dragDropBlockDefinition, dragDropConfiguration } from "./drag-drop-definition";
import { DragDropAuthoringWorkspace } from "./DragDropAuthoringWorkspace";
import { createDragDropNode } from "./node";
import { isDragDropOwnerNodeType } from "@/editor/assessment/drag-drop/node-codecs";

export { dragDropConfiguration };

function DragDropAuthoringView(props: NodeViewProps) {
  return (
    <AssessmentProblemContent editable blockClass="sc-course-drag-drop" nodeViewProps={props} />
  );
}

export class DragDropCanvasErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error | null } {
    return { error };
  }

  private readonly handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <p role="alert" contentEditable={false} data-drag-drop-canvas-error="">
          This block hit an error.{" "}
          <button type="button" onClick={this.handleRetry}>
            Retry
          </button>
        </p>
      );
    }
    return this.props.children;
  }
}

function DragDropCanvasAuthoringViewWithBoundary(props: NodeViewProps): ReactNode {
  return (
    <DragDropCanvasErrorBoundary>
      <DragDropCanvasAuthoringView {...props} />
    </DragDropCanvasErrorBoundary>
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
  // Node views can render transiently before positions/attrs settle (fresh insert, node
  // replacement): fall back to pristine defaults instead of white-screening. Genuinely
  // malformed attrs still throw via schema parse below.
  const data = useMemo(
    () => DragDropCanvasDataSchema.parse(rawData ?? defaultDragDropCanvasData()),
    [rawData],
  );
  const assessment = useMemo(
    () => DragDropPrivateAssessmentSchema.parse(rawAssessment ?? {}),
    [rawAssessment],
  );
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [pickerKind, setPickerKind] = useState<"background" | "custom" | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const customApply = useRef<((visual: Extract<MarkerVisual, { kind: "custom" }>) => void) | null>(
    null,
  );
  const [customSources, setCustomSources] = useState<Record<string, string>>({});
  const [authoringIssue, setAuthoringIssue] = useState<DragDropAuthoringPresentationIssue | null>(
    null,
  );
  const customMediaIds = useMemo(() => managedCustomIconIds(data), [data]);
  const imageMode = data.image?.mode ?? null;
  const imageReference =
    data.image?.mode === "external"
      ? data.image.src
      : data.image?.mode === "managed"
        ? data.image.mediaId
        : null;

  useEffect(() => {
    let current = true;
    setMediaError(false);
    if (imageMode === null || imageReference === null) {
      setImageSrc(null);
      return () => {
        current = false;
      };
    }
    if (imageMode === "external") {
      setImageSrc(imageReference);
      return () => {
        current = false;
      };
    }
    void mediaPort
      ?.resolve(imageReference)
      .then((url) => {
        if (current) setImageSrc(url);
      })
      .catch(() => {
        if (current) setMediaError(true);
      });
    return () => {
      current = false;
    };
  }, [imageMode, imageReference, mediaPort, reload]);

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
      return null;
    }
    const result = target.transact((tr, resolved) => {
      const outcome = mutation(tr, resolved);
      if (outcome.ok) {
        // Keep the editor selection parked at this block. Post-transaction
        // focus otherwise scrolls the editor to a stale selection (often
        // the document tail), yanking the author away from the canvas.
        if (!setTextSelectionNearInTransaction(outcome.tr, resolved.pos)) {
          throw new Error("Failed to preserve the Drag and Drop authoring selection.");
        }
      }
      return outcome;
    });
    if (!result.ok) {
      setAuthoringIssue(expectedAuthoringIssue(result.issue));
      return null;
    }
    setAuthoringIssue(null);
    return result;
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

  const boundedFillActive = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => isDragDropBoundedFillActive(editor, canvasPos),
  });
  const isFullSlide = owner?.node.type.name === "surface_drag_drop_question";
  const presentation = isFullSlide ? "full-slide" : boundedFillActive ? "bounded" : "compact";

  const canvasCallbacks = {
    onRequestBackground: () => setPickerKind("background"),
    onRetryBackground: () => setReload((value) => value + 1),
    onCreateMarker: (
      draft: Readonly<{ label: string; visualOverride: MarkerVisual | null }>,
      geometry: Parameters<typeof createDragDropMarkerChecked>[0]["geometry"],
    ) => {
      const result = transact((tr, resolved) =>
        createDragDropMarkerChecked({
          tr,
          target: resolved,
          draft,
          geometry,
          createMarkerId: createEmbeddedDataId,
        }),
      );
      return result && "markerId" in result ? ((result.markerId ?? null) as never) : null;
    },
    onUpdateMarker: (
      markerId: string,
      patch: Parameters<typeof updateDragDropMarkerChecked>[0]["patch"],
    ) => {
      transact((tr, resolved) =>
        updateDragDropMarkerChecked({ tr, target: resolved, markerId, patch }),
      );
    },
    onReorderMarkers: (markerIds: readonly string[]) => {
      transact((tr, resolved) =>
        reorderDragDropMarkersChecked({ tr, target: resolved, markerIds }),
      );
    },
    onSetCorrectPlacement: (
      markerId: string,
      geometry: Parameters<typeof setDragDropCorrectPlacementChecked>[0]["geometry"],
    ) => {
      transact((tr, resolved) =>
        setDragDropCorrectPlacementChecked({ tr, target: resolved, markerId, geometry }),
      );
    },
    onDeleteMarker: (markerId: string) => {
      transact((tr, resolved) => deleteDragDropMarkerChecked({ tr, target: resolved, markerId }));
    },
    onSetDefaultMarkerVisual: (visual: MarkerVisual) => {
      transact((tr, resolved) =>
        setDragDropDefaultMarkerVisualChecked({ tr, target: resolved, visual }),
      );
    },
    onRequestCustomIcon: (apply: (visual: Extract<MarkerVisual, { kind: "custom" }>) => void) => {
      customApply.current = apply;
      setPickerKind("custom");
    },
    customIconSrc: (mediaId: string) => customSources[mediaId] ?? null,
  } as const;

  const addMarkerFromToolbar = () => {
    canvasCallbacks.onCreateMarker(
      { label: `Marker ${data.markers.length + 1}`, visualOverride: null },
      { kind: "circle", centerX: 50, centerY: 50, radius: 8 },
    );
  };

  return (
    <NodeViewWrapper data-node="drag-drop-canvas" contentEditable={false}>
      {authoringIssue ? (
        <p role="alert" data-drag-drop-authoring-issue={authoringIssue.code}>
          {authoringIssue.message}
        </p>
      ) : null}
      <DragDropAuthoringWorkspace.Root open={workspaceOpen} onOpenChange={setWorkspaceOpen}>
        <DragDropAuthoringCanvas
          {...canvasCallbacks}
          data={data}
          assessment={assessment}
          imageSrc={imageSrc}
          mediaError={mediaError}
          presentation={presentation}
          renderLiveRegion={!workspaceOpen}
          onRequestWorkspace={() => setWorkspaceOpen(true)}
        />
        <DragDropAuthoringWorkspace.Content
          title="Edit Drag and Drop markers"
          description={`${data.markers.length} marker${data.markers.length === 1 ? "" : "s"}. Drag on the image to draw marker zones; drag markers to move.`}
          toolbar={
            <DragDropAuthoringWorkspace.ToolbarGroup aria-label="Image actions">
              <DragDropAuthoringWorkspace.ToolbarAction
                label="Replace background image"
                intent="replace"
                onClick={() => setPickerKind("background")}
              >
                <ArrowsClockwise size={iconMd} aria-hidden />
              </DragDropAuthoringWorkspace.ToolbarAction>
              <DragDropAuthoringWorkspace.ToolbarAction
                data-drag-drop-add-marker=""
                label="Add marker"
                intent="add"
                onClick={addMarkerFromToolbar}
              >
                <Plus size={iconMd} aria-hidden />
              </DragDropAuthoringWorkspace.ToolbarAction>
            </DragDropAuthoringWorkspace.ToolbarGroup>
          }
        >
          <DragDropAuthoringCanvas
            {...canvasCallbacks}
            data={data}
            assessment={assessment}
            imageSrc={imageSrc}
            mediaError={mediaError}
            presentation="expanded"
          />
        </DragDropAuthoringWorkspace.Content>
      </DragDropAuthoringWorkspace.Root>
      <FilePickerModal
        nested={workspaceOpen}
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
  addNodeView: () =>
    ReactNodeViewRenderer(DragDropCanvasAuthoringViewWithBoundary, {
      // ProseMirror's native mousedown listener runs before React's
      // delegated handlers, so it would move the selection (and scroll to
      // it) on every canvas click. The canvas owns its pointer events.
      stopEvent: ({ event }) =>
        event.type.startsWith("pointer") ||
        event.type.startsWith("mouse") ||
        event.type === "click" ||
        event.type === "dblclick",
    }),
});

export const DragDropAuthoringExtension = Extension.create({
  name: "drag_drop_authoring_bundle",
  addExtensions() {
    return [DragDropCanvasAuthoringNode, DragDropAuthoringNode];
  },
});

function isDragDropBoundedFillActive(
  editor: NodeViewProps["editor"],
  canvasPos: number | undefined,
): boolean {
  if (typeof canvasPos !== "number") return false;
  const owner = findOwner(editor.state.doc.resolve(canvasPos));
  if (!owner || owner.node.type.name !== "drag_drop") return false;
  let capabilities: ReturnType<typeof getScaffoldCapabilitiesForEditor>;
  try {
    capabilities = getScaffoldCapabilitiesForEditor(editor);
  } catch {
    // Minimal editors (tests, embedded hosts) may not install capabilities.
    return false;
  }
  return (
    resolveActiveBoundedPlacement({
      blockDefinitions: capabilities.blocks.registry,
      capability: "fill",
      doc: editor.state.doc,
      layoutDefinitions: capabilities.layouts.registry,
      pos: owner.pos,
    }) === "fill"
  );
}

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
