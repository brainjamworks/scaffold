import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  SpatialPlacementAssessmentSchema,
  type EmbeddedDataId,
  type MarkerPresetId,
  type MarkerVisual,
} from "@scaffold/contracts";

import { useAssessmentRuntimeById } from "@/editor/assessment/shared/runtime/use-assessment-runtime";
import {
  SpatialImageSurface,
  normalizedPointToOverlayStyle,
  type SpatialImagePoint,
  type SpatialImageSurfaceState,
} from "@/editor/blocks/assessment/shared/spatial";
import { InteractionDragSession } from "@/editor/interactions/drag/react/InteractionDragSession";
import { useInteractionDragSource } from "@/editor/interactions/drag/react/use-interaction-drag-source";
import { useInteractionDropTarget } from "@/editor/interactions/drag/react/use-interaction-drop-target";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";

import type { DragDropCourseContent, DragDropCourseMarker } from "./drag-drop-course-content";
import {
  createIdleDragDropKeyboardCursor,
  transitionDragDropKeyboardCursor,
  type DragDropKeyboardCursorDirection,
  type DragDropKeyboardCursorState,
  type DragDropKeyboardCursorStep,
} from "./drag-drop-keyboard-cursor";
import { resolveDragDropPointerPlacement } from "./drag-drop-pointer-session";
import { DragDropCourseWorkspace } from "./DragDropCourseWorkspace";
import "./DragDrop.css";

export type DragDropPresentation = "inline" | "expanded" | "full-slide";

export interface DragDropCourseInteractionProps {
  readonly assessmentTargetId: string | null;
  readonly content: DragDropCourseContent;
  readonly presentation: DragDropPresentation;
  readonly onRequestExpand?: () => void;
}

interface DragMarkerData {
  readonly markerId: EmbeddedDataId;
  readonly label: string;
}

interface ImageDropData {
  readonly presentation: DragDropPresentation;
}

interface FocusRequest {
  readonly key: number;
  readonly markerId: EmbeddedDataId;
  readonly presentation: DragDropPresentation;
}

type RuntimeController = NonNullable<ReturnType<typeof useAssessmentRuntimeById>>;
const EMPTY_PLACEMENTS: Readonly<Record<string, SpatialImagePoint>> = {};

interface OwnerState {
  readonly activeDragMarkerId: EmbeddedDataId | null;
  readonly announcement: string;
  readonly content: DragDropCourseContent;
  readonly displayMarkers: readonly DragDropCourseMarker[];
  readonly displayPlacements: Readonly<Record<string, SpatialImagePoint>>;
  readonly focusRequest: FocusRequest | null;
  readonly imageSrc: string | null;
  readonly keyboardCursor: DragDropKeyboardCursorState;
  readonly locked: boolean;
  readonly mediaUnavailable: boolean;
  readonly canRetryImage: boolean;
  readonly placed: readonly DragDropCourseMarker[];
  readonly problem: RuntimeController["problem"];
  readonly readyPresentations: ReadonlySet<DragDropPresentation>;
  readonly resolvedIcons: Readonly<Record<string, string>>;
  readonly responseReady: boolean;
  readonly reviewMarkerId: EmbeddedDataId | null;
  readonly selectedMarkerId: EmbeddedDataId | null;
  readonly unplaced: readonly DragDropCourseMarker[];
  readonly activateKeyboardPresentation: (presentation: DragDropPresentation) => void;
  readonly cancelSelection: () => void;
  readonly announceKeyboardPosition: () => void;
  readonly cancelKeyboardPositioning: () => void;
  readonly clearSurface: (presentation: DragDropPresentation) => void;
  readonly clearFocusRequest: (key: number) => void;
  readonly imageFailed: (presentation: DragDropPresentation) => void;
  readonly imageLoaded: (presentation: DragDropPresentation) => void;
  readonly placeSelected: (presentation: DragDropPresentation, x: number, y: number) => void;
  readonly registerSurface: (
    presentation: DragDropPresentation,
    state: SpatialImageSurfaceState,
  ) => void;
  readonly removeMarker: (marker: DragDropCourseMarker, presentation: DragDropPresentation) => void;
  readonly reset: (presentation: DragDropPresentation) => void;
  readonly retryImage: () => void;
  readonly inspectPlacedMarker: (marker: DragDropCourseMarker) => void;
  readonly commitKeyboardPositioning: () => void;
  readonly moveKeyboardCursor: (
    direction: DragDropKeyboardCursorDirection,
    step: DragDropKeyboardCursorStep,
  ) => void;
  readonly selectMarker: (marker: DragDropCourseMarker) => void;
  readonly selectPlacedMarker: (marker: DragDropCourseMarker) => void;
  readonly startKeyboardPositioning: (
    marker: DragDropCourseMarker,
    presentation: DragDropPresentation,
    origin: HTMLElement,
  ) => void;
}

export function DragDropInlineCourseWorkspace({
  assessmentTargetId,
  content,
}: Pick<DragDropCourseInteractionProps, "assessmentTargetId" | "content">) {
  const [open, setOpen] = useState(false);
  return (
    <Owner assessmentTargetId={assessmentTargetId} content={content}>
      {(owner) => (
        <DragDropCourseWorkspace.Root open={open} onOpenChange={setOpen}>
          <Presentation owner={owner} presentation="inline" onRequestExpand={() => setOpen(true)} />
          <DragDropCourseWorkspace.Content
            title="Answer Drag and Drop"
            description="Place each marker on the image."
          >
            <Presentation owner={owner} presentation="expanded" />
          </DragDropCourseWorkspace.Content>
        </DragDropCourseWorkspace.Root>
      )}
    </Owner>
  );
}

export function DragDropCourseInteraction(props: DragDropCourseInteractionProps) {
  return (
    <Owner assessmentTargetId={props.assessmentTargetId} content={props.content}>
      {(owner) => (
        <Presentation
          owner={owner}
          presentation={props.presentation}
          {...(props.onRequestExpand ? { onRequestExpand: props.onRequestExpand } : {})}
        />
      )}
    </Owner>
  );
}

function Owner({
  assessmentTargetId,
  children,
  content,
}: {
  readonly assessmentTargetId: string | null;
  readonly children: (owner: OwnerState) => ReactNode;
  readonly content: DragDropCourseContent;
}) {
  const assessment = useAssessmentRuntimeById(assessmentTargetId, "spatial-placement");
  const runtime = assessment?.interaction ?? null;
  const problem = assessment?.problem ?? null;
  const mediaPort = useMediaPort();
  const surfaces = useRef<Partial<Record<DragDropPresentation, SpatialImageSurfaceState>>>({});
  const contentRef = useRef(content);
  contentRef.current = content;
  const activeDragMarker = useRef<DragDropCourseMarker | null>(null);
  const focusSequence = useRef(0);
  const keyboardCursorRef = useRef<DragDropKeyboardCursorState>(createIdleDragDropKeyboardCursor());
  const keyboardPresentationRef = useRef<DragDropPresentation | null>(null);
  const keyboardFocusOrigin = useRef<HTMLElement | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<EmbeddedDataId | null>(null);
  const [reviewMarkerId, setReviewMarkerId] = useState<EmbeddedDataId | null>(null);
  const [activeDragMarkerId, setActiveDragMarkerId] = useState<EmbeddedDataId | null>(null);
  const [resolvedImage, setResolvedImage] = useState<{ mediaId: string; src: string } | null>(null);
  const [resolvedIcons, setResolvedIcons] = useState<Readonly<Record<string, string>>>({});
  const [mediaUnavailable, setMediaUnavailable] = useState(false);
  const [mediaAttempt, setMediaAttempt] = useState(0);
  const [readyPresentations, setReadyPresentations] = useState<ReadonlySet<DragDropPresentation>>(
    new Set(),
  );
  const [announcement, setAnnouncement] = useState("");
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [keyboardCursor, setKeyboardCursorState] = useState<DragDropKeyboardCursorState>(
    keyboardCursorRef.current,
  );
  const image = content.image;
  const managedImageId = image?.mode === "managed" ? image.mediaId : null;

  const setKeyboardCursor = useCallback((next: DragDropKeyboardCursorState) => {
    keyboardCursorRef.current = next;
    setKeyboardCursorState(next);
  }, []);
  const setKeyboardPresentation = useCallback((next: DragDropPresentation | null) => {
    keyboardPresentationRef.current = next;
  }, []);

  useEffect(() => {
    if (!managedImageId) {
      setResolvedImage(null);
      setMediaUnavailable(false);
      return undefined;
    }
    let cancelled = false;
    setMediaUnavailable(false);
    void (async () => {
      try {
        if (!mediaPort) throw new Error("No media port configured.");
        const src = await mediaPort.resolve(managedImageId);
        if (!cancelled) setResolvedImage({ mediaId: managedImageId, src });
      } catch {
        if (!cancelled) {
          setResolvedImage(null);
          setMediaUnavailable(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [managedImageId, mediaAttempt, mediaPort]);

  useEffect(() => {
    const mediaIds = Array.from(
      new Set(
        content.markers.flatMap(({ visual }) =>
          visual.kind === "custom" ? [visual.source.mediaId] : [],
        ),
      ),
    );
    if (mediaIds.length === 0) {
      setResolvedIcons({});
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        mediaIds.map(async (mediaId) => {
          try {
            if (!mediaPort) throw new Error("No media port configured.");
            return [mediaId, await mediaPort.resolve(mediaId)] as const;
          } catch {
            return null;
          }
        }),
      );
      if (!cancelled) {
        setResolvedIcons(Object.fromEntries(entries.filter((entry) => entry !== null)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [content.markers, mediaPort]);

  const imageSrc =
    image?.mode === "external"
      ? image.src
      : managedImageId && resolvedImage?.mediaId === managedImageId
        ? resolvedImage.src
        : null;
  useEffect(() => {
    surfaces.current = {};
    setReadyPresentations(new Set());
  }, [imageSrc]);

  const locked = problem?.interactionLocked ?? true;
  const placements = runtime?.placements ?? EMPTY_PLACEMENTS;
  const placed = content.markers.filter(({ id }) => placements[id] !== undefined);
  const unplaced = content.markers.filter(({ id }) => placements[id] === undefined);
  const revealed =
    problem?.answerKeyVisible && problem.answerView === "correct" && problem.state.revealedAnswer
      ? SpatialPlacementAssessmentSchema.parse(problem.state.revealedAnswer.answers)
      : null;
  const displayPlacements: Readonly<Record<string, SpatialImagePoint>> = revealed
    ? Object.fromEntries(
        revealed.correctPlacements.map(({ geometry, markerId }) => [
          markerId,
          { x: geometry.centerX, y: geometry.centerY },
        ]),
      )
    : placements;
  const displayMarkers = revealed ? content.markers : placed;
  const selectedMarker = selectedMarkerId
    ? (content.markers.find(({ id }) => id === selectedMarkerId) ?? null)
    : null;
  if (selectedMarkerId && !selectedMarker) {
    throw new Error(`Drag and Drop selected marker "${selectedMarkerId}" is no longer current.`);
  }

  useEffect(() => {
    if (!locked) return;
    if (keyboardCursorRef.current.kind === "positioning") {
      const transition = transitionDragDropKeyboardCursor(keyboardCursorRef.current, {
        type: "cancel",
      });
      setKeyboardCursor(transition.state);
      setKeyboardPresentation(null);
      const origin = keyboardFocusOrigin.current;
      keyboardFocusOrigin.current = null;
      requestAnimationFrame(() => origin?.isConnected && origin.focus({ preventScroll: true }));
    }
    setSelectedMarkerId(null);
    setReviewMarkerId(null);
    setActiveDragMarkerId(null);
    activeDragMarker.current = null;
  }, [locked, setKeyboardCursor, setKeyboardPresentation]);
  useEffect(() => {
    if (!problem?.state.submitted) return;
    setAnnouncement(
      problem.answerView === "correct"
        ? "Answer revealed. Correct marker positions shown."
        : problem.feedbackResult?.isCorrect
          ? "Answer submitted. Correct."
          : "Answer submitted. Incorrect.",
    );
  }, [problem?.answerView, problem?.feedbackResult?.isCorrect, problem?.state.submitted]);

  const requestFocus = useCallback(
    (markerId: EmbeddedDataId, presentation: DragDropPresentation) => {
      focusSequence.current += 1;
      setFocusRequest({ key: focusSequence.current, markerId, presentation });
    },
    [],
  );
  const restoreKeyboardFocus = useCallback(
    (markerId: EmbeddedDataId, presentation: DragDropPresentation) => {
      const origin = keyboardFocusOrigin.current;
      keyboardFocusOrigin.current = null;
      requestAnimationFrame(() => {
        if (origin?.isConnected) origin.focus({ preventScroll: true });
        else requestFocus(markerId, presentation);
      });
    },
    [requestFocus],
  );
  const finishPlacement = useCallback(
    (
      marker: DragDropCourseMarker,
      outcome: { status: "updated" | "attempt-locked" | "unavailable" },
    ) => {
      if (outcome.status === "updated") {
        setSelectedMarkerId(null);
        setReviewMarkerId(null);
        setAnnouncement(`${marker.label} placed.`);
      } else if (outcome.status === "attempt-locked") {
        setAnnouncement("This attempt is locked.");
      } else {
        setAnnouncement("Marker placement is unavailable.");
      }
    },
    [],
  );
  const startKeyboardPositioning = useCallback(
    (marker: DragDropCourseMarker, presentation: DragDropPresentation, origin: HTMLElement) => {
      if (locked) {
        setAnnouncement("This attempt is locked.");
        return;
      }
      if (!runtime) {
        setAnnouncement("Marker placement is unavailable.");
        return;
      }
      if (!readyPresentations.has(presentation)) {
        setAnnouncement("The image is not ready for marker placement.");
        return;
      }
      const transition = transitionDragDropKeyboardCursor(keyboardCursorRef.current, {
        type: "start",
        markerId: marker.id,
        originalPoint: placements[marker.id] ?? null,
      });
      setKeyboardCursor(transition.state);
      setKeyboardPresentation(presentation);
      keyboardFocusOrigin.current = origin;
      setReviewMarkerId(null);
      setSelectedMarkerId(marker.id);
      setAnnouncement(
        `${marker.label} keyboard positioning started. Use arrow keys to move, Enter or Space to place, and Escape to cancel.`,
      );
    },
    [locked, placements, readyPresentations, runtime, setKeyboardCursor, setKeyboardPresentation],
  );
  const activateKeyboardPresentation = useCallback(
    (presentation: DragDropPresentation) => {
      if (keyboardCursorRef.current.kind !== "positioning") {
        throw new Error("Cannot activate a presentation for an idle Drag and Drop cursor.");
      }
      if (keyboardPresentationRef.current === presentation) return;
      keyboardFocusOrigin.current = null;
      setKeyboardPresentation(presentation);
    },
    [setKeyboardPresentation],
  );
  const moveKeyboardCursor = useCallback(
    (direction: DragDropKeyboardCursorDirection, step: DragDropKeyboardCursorStep) => {
      const transition = transitionDragDropKeyboardCursor(keyboardCursorRef.current, {
        type: "move",
        direction,
        step,
      });
      setKeyboardCursor(transition.state);
    },
    [setKeyboardCursor],
  );
  const announceKeyboardPosition = useCallback(() => {
    const current = keyboardCursorRef.current;
    if (current.kind !== "positioning") {
      throw new Error("Cannot announce an idle Drag and Drop keyboard cursor.");
    }
    const marker = contentRef.current.markers.find(({ id }) => id === current.markerId);
    if (!marker) {
      throw new Error(`Keyboard marker "${current.markerId}" is no longer current.`);
    }
    setAnnouncement(
      `${marker.label} cursor at approximately ${Math.round(current.point.x)}% horizontal, ${Math.round(current.point.y)}% vertical.`,
    );
  }, []);
  const cancelKeyboardPositioning = useCallback(() => {
    const current = keyboardCursorRef.current;
    const presentation = keyboardPresentationRef.current;
    const transition = transitionDragDropKeyboardCursor(current, { type: "cancel" });
    const terminal = transition.terminal;
    if (!terminal || terminal.kind !== "cancel" || !presentation) {
      throw new Error("Expected keyboard cancellation to have an owning presentation.");
    }
    const marker = contentRef.current.markers.find(({ id }) => id === terminal.markerId);
    if (!marker) {
      throw new Error(`Keyboard marker "${terminal.markerId}" is no longer current.`);
    }
    setKeyboardCursor(transition.state);
    setKeyboardPresentation(null);
    setSelectedMarkerId(null);
    setAnnouncement(`${marker.label} positioning cancelled.`);
    restoreKeyboardFocus(marker.id, presentation);
  }, [restoreKeyboardFocus, setKeyboardCursor, setKeyboardPresentation]);
  const commitKeyboardPositioning = useCallback(() => {
    const current = keyboardCursorRef.current;
    const presentation = keyboardPresentationRef.current;
    if (!runtime) {
      setAnnouncement("Marker placement is unavailable.");
      return;
    }
    const transition = transitionDragDropKeyboardCursor(current, { type: "commit" });
    const terminal = transition.terminal;
    if (!terminal || terminal.kind !== "commit" || !presentation) {
      throw new Error("Expected keyboard placement to have an owning presentation.");
    }
    const marker = contentRef.current.markers.find(({ id }) => id === terminal.markerId);
    if (!marker) {
      throw new Error(`Keyboard marker "${terminal.markerId}" is no longer current.`);
    }
    const outcome = runtime.setPlacement(marker.id, terminal.point);
    setKeyboardCursor(transition.state);
    setKeyboardPresentation(null);
    finishPlacement(marker, outcome);
    restoreKeyboardFocus(marker.id, presentation);
  }, [finishPlacement, restoreKeyboardFocus, runtime, setKeyboardCursor, setKeyboardPresentation]);
  const abandonKeyboardPositioning = useCallback(() => {
    if (keyboardCursorRef.current.kind !== "positioning") return;
    const transition = transitionDragDropKeyboardCursor(keyboardCursorRef.current, {
      type: "cancel",
    });
    setKeyboardCursor(transition.state);
    setKeyboardPresentation(null);
    keyboardFocusOrigin.current = null;
  }, [setKeyboardCursor, setKeyboardPresentation]);
  const selectMarker = useCallback(
    (marker: DragDropCourseMarker) => {
      abandonKeyboardPositioning();
      if (locked) {
        setAnnouncement("This attempt is locked.");
      } else if (selectedMarkerId === marker.id) {
        setSelectedMarkerId(null);
        setAnnouncement(`${marker.label} selection cancelled.`);
      } else {
        setReviewMarkerId(null);
        setSelectedMarkerId(marker.id);
        setAnnouncement(`${marker.label} selected. Choose a position on the image.`);
      }
    },
    [abandonKeyboardPositioning, locked, selectedMarkerId],
  );
  const inspectPlacedMarker = useCallback(
    (marker: DragDropCourseMarker) => {
      const point = displayPlacements[marker.id];
      if (!point) return;
      const overlaps = displayMarkers.filter((candidate) => {
        const candidatePoint = displayPlacements[candidate.id];
        return candidatePoint?.x === point.x && candidatePoint.y === point.y;
      });
      const inspectedIndex = overlaps.findIndex(({ id }) => id === reviewMarkerId);
      const next = inspectedIndex >= 0 ? overlaps[(inspectedIndex + 1) % overlaps.length] : marker;
      if (!next) throw new Error("A placed marker overlap group cannot be empty.");
      setReviewMarkerId(next.id);
      setAnnouncement(
        overlaps.length > 1
          ? `${next.label}, ${overlaps.indexOf(next) + 1} of ${overlaps.length} overlapping markers.`
          : `${next.label} position selected for review.`,
      );
    },
    [displayMarkers, displayPlacements, reviewMarkerId],
  );
  const selectPlacedMarker = useCallback(
    (marker: DragDropCourseMarker) => {
      abandonKeyboardPositioning();
      if (locked) {
        inspectPlacedMarker(marker);
        return;
      }
      const point = placements[marker.id];
      if (!point) return selectMarker(marker);
      const overlaps = content.markers.filter((candidate) => {
        const candidatePoint = placements[candidate.id];
        return candidatePoint?.x === point.x && candidatePoint.y === point.y;
      });
      const selectedIndex = overlaps.findIndex(({ id }) => id === selectedMarkerId);
      const next = selectedIndex >= 0 ? overlaps[(selectedIndex + 1) % overlaps.length] : marker;
      if (!next) throw new Error("A placed marker overlap group cannot be empty.");
      setReviewMarkerId(null);
      setSelectedMarkerId(next.id);
      setAnnouncement(
        overlaps.length > 1
          ? `${next.label} selected, ${overlaps.indexOf(next) + 1} of ${overlaps.length} overlapping markers.`
          : `${next.label} selected. Choose a new position on the image.`,
      );
    },
    [
      abandonKeyboardPositioning,
      content.markers,
      inspectPlacedMarker,
      locked,
      placements,
      selectMarker,
      selectedMarkerId,
    ],
  );
  const cancelSelection = useCallback(() => {
    if (keyboardCursorRef.current.kind === "positioning") {
      cancelKeyboardPositioning();
      return;
    }
    if (!selectedMarker || activeDragMarker.current) return;
    setSelectedMarkerId(null);
    setAnnouncement(`${selectedMarker.label} selection cancelled.`);
  }, [cancelKeyboardPositioning, selectedMarker]);
  const clearSurface = useCallback(
    (presentation: DragDropPresentation) => {
      delete surfaces.current[presentation];
      setReadyPresentations((value) => {
        if (!value.has(presentation)) return value;
        const next = new Set(value);
        next.delete(presentation);
        return next;
      });
      if (
        keyboardPresentationRef.current === presentation &&
        keyboardCursorRef.current.kind === "positioning"
      ) {
        const markerId = keyboardCursorRef.current.markerId;
        const marker = contentRef.current.markers.find(({ id }) => id === markerId);
        const transition = transitionDragDropKeyboardCursor(keyboardCursorRef.current, {
          type: "cancel",
        });
        setKeyboardCursor(transition.state);
        setKeyboardPresentation(null);
        keyboardFocusOrigin.current = null;
        setSelectedMarkerId(null);
        setAnnouncement(
          marker ? `${marker.label} positioning cancelled.` : "Keyboard positioning cancelled.",
        );
      }
    },
    [setKeyboardCursor, setKeyboardPresentation],
  );
  const placeSelected = useCallback(
    (presentation: DragDropPresentation, x: number, y: number) => {
      if (!selectedMarker || !runtime) return;
      abandonKeyboardPositioning();
      const surface = surfaces.current[presentation];
      if (!surface) return;
      const result = resolveDragDropPointerPlacement({
        clientPoint: { x, y },
        locked,
        markerId: selectedMarker.id,
        surface,
      });
      if (result.status === "cancelled") {
        setAnnouncement(
          result.reason === "attempt-locked"
            ? "This attempt is locked."
            : "That position is outside the available image.",
        );
        return;
      }
      finishPlacement(selectedMarker, runtime.setPlacement(selectedMarker.id, result.point));
    },
    [abandonKeyboardPositioning, finishPlacement, locked, runtime, selectedMarker],
  );
  const removeMarker = useCallback(
    (marker: DragDropCourseMarker, presentation: DragDropPresentation) => {
      if (!runtime) return;
      abandonKeyboardPositioning();
      const outcome = runtime.removePlacement(marker.id);
      if (outcome.status === "updated") {
        if (selectedMarkerId === marker.id) setSelectedMarkerId(null);
        setAnnouncement(`${marker.label} removed.`);
        requestFocus(marker.id, presentation);
      } else {
        setAnnouncement(
          outcome.status === "attempt-locked"
            ? "This attempt is locked."
            : "Marker removal is unavailable.",
        );
      }
    },
    [abandonKeyboardPositioning, requestFocus, runtime, selectedMarkerId],
  );
  const reset = useCallback(
    (presentation: DragDropPresentation) => {
      if (!runtime) return;
      abandonKeyboardPositioning();
      const outcome = runtime.resetPlacements();
      if (outcome.status === "updated") {
        setSelectedMarkerId(null);
        setAnnouncement("Marker placements reset.");
        const first = content.markers[0];
        if (first) requestFocus(first.id, presentation);
      } else {
        setAnnouncement(
          outcome.status === "attempt-locked"
            ? "This attempt is locked."
            : "Marker reset is unavailable.",
        );
      }
    },
    [abandonKeyboardPositioning, content.markers, requestFocus, runtime],
  );

  const owner: OwnerState = {
    activeDragMarkerId,
    announcement,
    canRetryImage: managedImageId !== null,
    content,
    displayMarkers,
    displayPlacements,
    focusRequest,
    imageSrc,
    keyboardCursor,
    locked,
    mediaUnavailable,
    placed,
    problem,
    readyPresentations,
    resolvedIcons,
    responseReady: assessment?.response.hasValue ?? false,
    reviewMarkerId,
    selectedMarkerId,
    unplaced,
    activateKeyboardPresentation,
    announceKeyboardPosition,
    cancelSelection,
    cancelKeyboardPositioning,
    clearSurface,
    clearFocusRequest: (key) => setFocusRequest((value) => (value?.key === key ? null : value)),
    imageFailed: (presentation) => {
      setReadyPresentations((value) => {
        const next = new Set(value);
        next.delete(presentation);
        return next;
      });
      setMediaUnavailable(true);
    },
    imageLoaded: (presentation) => {
      setReadyPresentations((value) => new Set(value).add(presentation));
      setMediaUnavailable(false);
    },
    placeSelected,
    registerSurface: (presentation, state) => {
      surfaces.current[presentation] = state;
    },
    removeMarker,
    reset,
    retryImage: () => {
      setResolvedImage(null);
      setMediaUnavailable(false);
      setMediaAttempt((value) => value + 1);
    },
    inspectPlacedMarker,
    commitKeyboardPositioning,
    moveKeyboardCursor,
    selectMarker,
    selectPlacedMarker,
    startKeyboardPositioning,
  };

  return (
    <InteractionDragSession<DragMarkerData, ImageDropData>
      accessibilityMode="selection-alternative"
      collisionPolicy="pointer"
      disabled={locked}
      labels={{
        draggable: "Drag and Drop marker",
        instructions: "Drag the marker onto the image, or select it and choose a position.",
      }}
      onCancel={() => {
        const marker = activeDragMarker.current;
        setActiveDragMarkerId(null);
        activeDragMarker.current = null;
        if (marker) setAnnouncement(`${marker.label} move cancelled.`);
      }}
      onEnd={(event) => {
        const marker = content.markers.find(({ id }) => id === event.active.data.markerId);
        if (!marker)
          throw new Error(`Dragged marker "${event.active.data.markerId}" is no longer current.`);
        setActiveDragMarkerId(null);
        activeDragMarker.current = null;
        const presentation = event.over?.data.presentation;
        const surface = presentation ? surfaces.current[presentation] : null;
        if (!runtime || !presentation || !surface) {
          setAnnouncement(`${marker.label} move cancelled.`);
          return;
        }
        const result = resolveDragDropPointerPlacement({
          clientPoint: event.clientPoint,
          locked,
          markerId: marker.id,
          surface,
        });
        if (result.status === "cancelled") {
          setAnnouncement(
            result.reason === "attempt-locked"
              ? "This attempt is locked."
              : `${marker.label} move cancelled.`,
          );
          return;
        }
        finishPlacement(marker, runtime.setPlacement(marker.id, result.point));
        requestFocus(marker.id, presentation);
      }}
      onStart={(event) => {
        const marker = content.markers.find(({ id }) => id === event.active.data.markerId);
        if (!marker)
          throw new Error(`Dragged marker "${event.active.data.markerId}" is no longer current.`);
        abandonKeyboardPositioning();
        activeDragMarker.current = marker;
        setActiveDragMarkerId(marker.id);
        setReviewMarkerId(null);
        setSelectedMarkerId(marker.id);
        setAnnouncement(`${marker.label} picked up.`);
      }}
      profile="pointer"
      renderPreview={(active) => {
        const marker = content.markers.find(({ id }) => id === active.markerId);
        if (!marker)
          throw new Error(`Drag preview marker "${active.markerId}" is no longer current.`);
        return (
          <span className="sc-course-drag-drop-drag-preview">
            <MarkerVisualView marker={marker} resolvedIcons={resolvedIcons} />
            <span>{marker.label}</span>
          </span>
        );
      }}
      sessionId={`drag-drop-${assessmentTargetId ?? "runtime"}`}
    >
      {children(owner)}
    </InteractionDragSession>
  );
}

function Presentation({
  onRequestExpand,
  owner,
  presentation,
}: {
  readonly onRequestExpand?: () => void;
  readonly owner: OwnerState;
  readonly presentation: DragDropPresentation;
}) {
  const legendId = useId();
  const instructionsId = useId();
  const statusId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const drop = useInteractionDropTarget<ImageDropData>({
    data: { presentation },
    disabled: owner.locked || !owner.readyPresentations.has(presentation),
    id: `drag-drop-image:${presentation}`,
    label: "Drag and Drop image",
  });
  const selectedMarker = owner.selectedMarkerId
    ? (owner.content.markers.find(({ id }) => id === owner.selectedMarkerId) ?? null)
    : null;
  const ready = Boolean(
    owner.imageSrc && owner.readyPresentations.has(presentation) && !owner.mediaUnavailable,
  );
  const clearSurface = owner.clearSurface;

  useEffect(() => {
    const request = owner.focusRequest;
    if (!request || request.presentation !== presentation) return;
    const frame = requestAnimationFrame(() => {
      sectionRef.current
        ?.querySelector<HTMLElement>(`[data-drag-drop-focus-marker="${request.markerId}"]`)
        ?.focus({ preventScroll: true });
      owner.clearFocusRequest(request.key);
    });
    return () => cancelAnimationFrame(frame);
  }, [owner, presentation]);
  useEffect(
    () => () => {
      clearSurface(presentation);
    },
    [clearSurface, presentation],
  );

  const navigableMarkers = owner.displayMarkers;
  const activeNavigationMarkerId = owner.reviewMarkerId ?? owner.selectedMarkerId;
  const selectedPlacedIndex = navigableMarkers.findIndex(
    ({ id }) => id === activeNavigationMarkerId,
  );
  const currentPlacedIndex = selectedPlacedIndex >= 0 ? selectedPlacedIndex : 0;
  const currentPlaced = navigableMarkers[currentPlacedIndex] ?? null;
  const navigatePlaced = (index: number) => {
    const marker = navigableMarkers[index];
    if (marker) owner.inspectPlacedMarker(marker);
  };
  const keyboardMarkerId =
    owner.keyboardCursor.kind === "positioning" ? owner.keyboardCursor.markerId : null;
  const keyboardMarker = keyboardMarkerId
    ? (owner.content.markers.find(({ id }) => id === keyboardMarkerId) ?? null)
    : null;
  if (owner.keyboardCursor.kind === "positioning" && !keyboardMarker) {
    throw new Error(`Keyboard marker "${owner.keyboardCursor.markerId}" is no longer current.`);
  }

  return (
    <section
      ref={sectionRef}
      className="sc-course-drag-drop-interaction"
      aria-label="Drag and Drop response"
      data-assessment-answer-view={owner.problem?.answerView ?? "submitted"}
      data-drag-drop-presentation={presentation}
      data-drag-drop-response-ready={String(owner.responseReady)}
      onKeyDown={(event) => {
        if (event.key === "Escape") owner.cancelSelection();
      }}
    >
      {owner.content.accessibleLegend ? (
        <p id={legendId}>{owner.content.accessibleLegend}</p>
      ) : null}
      <p id={instructionsId} className="sc-course-drag-drop-keyboard-instructions">
        Keyboard: focus a marker and press Enter or Space to position it. Use arrow keys to move;
        Shift moves coarsely and Alt moves finely. Press Enter or Space to place, or Escape to
        cancel.
      </p>
      <p id={statusId} role="status" aria-live="polite">
        {owner.announcement ? `${owner.announcement} ` : null}
        {owner.placed.length} of {owner.content.markers.length} markers placed.
      </p>
      <div className="sc-course-drag-drop-interaction__layout">
        <div
          className="sc-course-drag-drop-stage"
          data-drop-active={drop.isDropTarget || undefined}
          data-drag-active={owner.activeDragMarkerId ? "" : undefined}
        >
          <SpatialImageSurface
            ref={drop.targetRef}
            src={owner.imageSrc}
            alt={owner.content.image?.alt ?? ""}
            aspectRatioCssProperty="--sc-drag-drop-aspect-ratio"
            onImageLoad={() => owner.imageLoaded(presentation)}
            onImageError={() => owner.imageFailed(presentation)}
            surfaceProps={{
              "aria-describedby": [
                owner.content.accessibleLegend ? legendId : null,
                instructionsId,
                statusId,
              ]
                .filter(Boolean)
                .join(" "),
              "aria-disabled": owner.locked || !ready || undefined,
              "aria-label": selectedMarker
                ? `Place ${selectedMarker.label} on the image`
                : "Drag and Drop image",
              onClick: (event) => owner.placeSelected(presentation, event.clientX, event.clientY),
              role: "group",
            }}
          >
            {(state) => {
              owner.registerSurface(presentation, state);
              return (
                <>
                  {owner.displayMarkers.map((marker, index) => {
                    const point = owner.displayPlacements[marker.id];
                    if (!point) throw new Error(`Placed marker "${marker.id}" has no position.`);
                    return (
                      <PlacedMarker
                        key={marker.id}
                        describedBy={instructionsId}
                        dragDisabled={owner.locked || !ready}
                        feedbackState={markerFeedbackState(owner, marker)}
                        index={index}
                        inspectionDisabled={!ready}
                        marker={marker}
                        point={point}
                        presentation={presentation}
                        resolvedIcons={owner.resolvedIcons}
                        selected={
                          owner.selectedMarkerId === marker.id || owner.reviewMarkerId === marker.id
                        }
                        total={owner.displayMarkers.length}
                        onKeyboardStart={
                          owner.locked
                            ? undefined
                            : (origin) =>
                                owner.startKeyboardPositioning(marker, presentation, origin)
                        }
                        onSelect={() => owner.selectPlacedMarker(marker)}
                      />
                    );
                  })}
                  {owner.keyboardCursor.kind === "positioning" && keyboardMarker && ready ? (
                    <KeyboardCursor
                      describedBy={instructionsId}
                      marker={keyboardMarker!}
                      point={owner.keyboardCursor.point}
                      resolvedIcons={owner.resolvedIcons}
                      onActivate={() => owner.activateKeyboardPresentation(presentation)}
                      onCancel={owner.cancelKeyboardPositioning}
                      onCommit={owner.commitKeyboardPositioning}
                      onMove={owner.moveKeyboardCursor}
                      onMovementEnd={owner.announceKeyboardPosition}
                    />
                  ) : null}
                </>
              );
            }}
          </SpatialImageSurface>
          {owner.mediaUnavailable ? (
            <div role="alert">
              <p>The background image is unavailable.</p>
              {owner.canRetryImage ? (
                <button type="button" onClick={owner.retryImage}>
                  Retry image
                </button>
              ) : (
                <p>Try reloading the course.</p>
              )}
            </div>
          ) : null}
          {!owner.imageSrc && !owner.mediaUnavailable ? <p role="status">Loading image…</p> : null}
        </div>

        <aside className="sc-course-drag-drop-tray" aria-label="Markers">
          <div className="sc-course-drag-drop-tray__unplaced">
            <h3>Markers to place</h3>
            {owner.unplaced.length === 0 ? <p>All markers placed.</p> : null}
            {owner.unplaced.map((marker) => (
              <TrayMarker
                key={marker.id}
                describedBy={instructionsId}
                disabled={owner.locked || !ready}
                focusMarkerId={marker.id}
                label={`Select ${accessibleMarkerLabel(owner.content, marker)} for placement`}
                marker={marker}
                presentation={presentation}
                resolvedIcons={owner.resolvedIcons}
                selected={owner.selectedMarkerId === marker.id}
                onKeyboardStart={(origin) =>
                  owner.startKeyboardPositioning(marker, presentation, origin)
                }
                onSelect={() => owner.selectMarker(marker)}
              />
            ))}
          </div>
          {owner.placed.length > 0 ? (
            <div className="sc-course-drag-drop-tray__placed">
              <h3>Placed markers</h3>
              <div
                className="sc-course-drag-drop-tray__navigation"
                role="group"
                aria-label="Placed marker navigation"
              >
                <button
                  type="button"
                  aria-label="Previous placed marker"
                  disabled={currentPlacedIndex <= 0}
                  onClick={() => navigatePlaced(currentPlacedIndex - 1)}
                >
                  Previous
                </button>
                <span aria-live="polite">
                  {currentPlaced
                    ? `${currentPlacedIndex + 1} of ${navigableMarkers.length}: ${currentPlaced.label}`
                    : "No placed marker"}
                </span>
                <button
                  type="button"
                  aria-label="Next placed marker"
                  disabled={currentPlacedIndex >= navigableMarkers.length - 1}
                  onClick={() => navigatePlaced(currentPlacedIndex + 1)}
                >
                  Next
                </button>
              </div>
              {owner.placed.map((marker) => (
                <div key={marker.id}>
                  <TrayMarker
                    describedBy={instructionsId}
                    disabled={!ready}
                    dragDisabled={owner.locked || !ready}
                    label={
                      owner.locked
                        ? `Inspect placed ${accessibleMarkerLabel(owner.content, marker)} position`
                        : `Select placed ${accessibleMarkerLabel(owner.content, marker)} for repositioning`
                    }
                    marker={marker}
                    presentation={presentation}
                    resolvedIcons={owner.resolvedIcons}
                    selected={
                      owner.selectedMarkerId === marker.id || owner.reviewMarkerId === marker.id
                    }
                    onKeyboardStart={
                      owner.locked
                        ? undefined
                        : (origin) => owner.startKeyboardPositioning(marker, presentation, origin)
                    }
                    onSelect={() => owner.selectPlacedMarker(marker)}
                  />
                  <button
                    type="button"
                    disabled={owner.locked}
                    onClick={() => owner.removeMarker(marker, presentation)}
                  >
                    Remove {accessibleMarkerLabel(owner.content, marker)}
                  </button>
                </div>
              ))}
              {currentPlaced ? (
                <button
                  type="button"
                  disabled={owner.locked}
                  onClick={() => owner.removeMarker(currentPlaced, presentation)}
                >
                  Remove current marker, {accessibleMarkerLabel(owner.content, currentPlaced)}
                </button>
              ) : null}
            </div>
          ) : null}
          {owner.content.markers.length >= 6 ? (
            <p className="sc-course-drag-drop-tray__scroll-hint">Scroll for more markers.</p>
          ) : null}
          <div className="sc-course-drag-drop-tray__actions">
            <button
              type="button"
              disabled={owner.locked || owner.placed.length === 0}
              onClick={() => owner.reset(presentation)}
            >
              Reset marker placements
            </button>
            {presentation === "inline" && onRequestExpand ? (
              <button type="button" onClick={onRequestExpand}>
                Expand Drag and Drop
              </button>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

function TrayMarker({
  describedBy,
  disabled,
  dragDisabled = disabled,
  focusMarkerId,
  label,
  marker,
  onKeyboardStart,
  onSelect,
  presentation,
  resolvedIcons,
  selected,
}: {
  readonly describedBy: string;
  readonly disabled: boolean;
  readonly dragDisabled?: boolean;
  readonly focusMarkerId?: EmbeddedDataId;
  readonly label: string;
  readonly marker: DragDropCourseMarker;
  readonly onKeyboardStart?: ((origin: HTMLElement) => void) | undefined;
  readonly onSelect: () => void;
  readonly presentation: DragDropPresentation;
  readonly resolvedIcons: Readonly<Record<string, string>>;
  readonly selected: boolean;
}) {
  const drag = useInteractionDragSource<DragMarkerData>({
    data: { markerId: marker.id, label: marker.label },
    disabled: dragDisabled,
    id: `drag-drop-marker:${presentation}:${marker.id}`,
    label,
  });
  return (
    <span
      ref={drag.sourceRef}
      className="sc-course-drag-drop-source"
      data-interaction-drag-placeholder={drag.isPlaceholder ? "" : undefined}
    >
      <button
        ref={drag.handleRef}
        type="button"
        aria-describedby={describedBy}
        aria-label={label}
        aria-pressed={selected}
        data-drag-drop-focus-marker={focusMarkerId}
        disabled={disabled}
        onKeyDown={(event) => {
          if (!onKeyboardStart || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          event.stopPropagation();
          onKeyboardStart(event.currentTarget);
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <MarkerVisualView marker={marker} resolvedIcons={resolvedIcons} />
        <span>{marker.label}</span>
      </button>
    </span>
  );
}

function PlacedMarker({
  describedBy,
  dragDisabled,
  feedbackState,
  index,
  inspectionDisabled,
  marker,
  onKeyboardStart,
  onSelect,
  point,
  presentation,
  resolvedIcons,
  selected,
  total,
}: {
  readonly describedBy: string;
  readonly dragDisabled: boolean;
  readonly feedbackState: "correct" | "incorrect" | "submitted" | null;
  readonly index: number;
  readonly inspectionDisabled: boolean;
  readonly marker: DragDropCourseMarker;
  readonly onKeyboardStart?: ((origin: HTMLElement) => void) | undefined;
  readonly onSelect: () => void;
  readonly point: SpatialImagePoint;
  readonly presentation: DragDropPresentation;
  readonly resolvedIcons: Readonly<Record<string, string>>;
  readonly selected: boolean;
  readonly total: number;
}) {
  const label = `Placed ${marker.label}, ${index + 1} of ${total}. ${
    dragDisabled ? "Review position" : "Drag to reposition"
  }`;
  const drag = useInteractionDragSource<DragMarkerData>({
    data: { markerId: marker.id, label: marker.label },
    disabled: dragDisabled,
    id: `drag-drop-canvas-marker:${presentation}:${marker.id}`,
    label,
  });
  return (
    <span
      ref={drag.sourceRef}
      className="sc-course-drag-drop-marker"
      data-course-state={feedbackState ?? undefined}
      data-edge-x={point.x <= 15 ? "left" : point.x >= 85 ? "right" : "middle"}
      data-edge-y={point.y >= 75 ? "bottom" : "top"}
      data-interaction-drag-placeholder={drag.isPlaceholder ? "" : undefined}
      data-selected={selected ? "" : undefined}
      style={{ ...(normalizedPointToOverlayStyle(point) as CSSProperties), zIndex: index + 1 }}
    >
      <button
        ref={drag.handleRef}
        type="button"
        aria-describedby={describedBy}
        aria-label={label}
        aria-pressed={selected}
        data-drag-drop-focus-marker={marker.id}
        disabled={inspectionDisabled}
        onKeyDown={(event) => {
          if (!onKeyboardStart || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          event.stopPropagation();
          onKeyboardStart(event.currentTarget);
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <MarkerVisualView marker={marker} resolvedIcons={resolvedIcons} />
      </button>
      <span className="sc-course-drag-drop-marker__label">{marker.label}</span>
      {feedbackState ? <span className="sc-sr-only">{feedbackState}</span> : null}
    </span>
  );
}

function KeyboardCursor({
  describedBy,
  marker,
  onActivate,
  onCancel,
  onCommit,
  onMove,
  onMovementEnd,
  point,
  resolvedIcons,
}: {
  readonly describedBy: string;
  readonly marker: DragDropCourseMarker;
  readonly onActivate: () => void;
  readonly onCancel: () => void;
  readonly onCommit: () => void;
  readonly onMove: (
    direction: DragDropKeyboardCursorDirection,
    step: DragDropKeyboardCursorStep,
  ) => void;
  readonly onMovementEnd: () => void;
  readonly point: SpatialImagePoint;
  readonly resolvedIcons: Readonly<Record<string, string>>;
}) {
  const cursorRef = useRef<HTMLButtonElement>(null);
  const overlayStyle = normalizedPointToOverlayStyle(point);
  useEffect(() => {
    cursorRef.current?.focus({ preventScroll: true });
  }, []);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const direction = keyboardDirection(event.key);
    if (direction) {
      event.preventDefault();
      event.stopPropagation();
      onMove(direction, keyboardStep(event));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onCommit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };
  return (
    <button
      ref={cursorRef}
      type="button"
      aria-describedby={describedBy}
      aria-label={`Position ${marker.label} at approximately ${Math.round(point.x)}% horizontal, ${Math.round(point.y)}% vertical`}
      className="sc-course-drag-drop-keyboard-cursor"
      data-drag-drop-keyboard-cursor=""
      style={
        {
          "--sc-drag-drop-keyboard-cursor-x": overlayStyle.left,
          "--sc-drag-drop-keyboard-cursor-y": overlayStyle.top,
        } as CSSProperties
      }
      onFocus={onActivate}
      onClick={onCommit}
      onKeyDown={handleKeyDown}
      onKeyUp={(event) => {
        if (keyboardDirection(event.key)) onMovementEnd();
      }}
    >
      <MarkerVisualView marker={marker} resolvedIcons={resolvedIcons} />
      <span className="sc-sr-only">Positioning {marker.label}</span>
    </button>
  );
}

function keyboardDirection(key: string): DragDropKeyboardCursorDirection | null {
  return (
    (
      {
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
      } as const
    )[key as "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp"] ?? null
  );
}

function keyboardStep(
  event: Pick<ReactKeyboardEvent<HTMLElement>, "altKey" | "shiftKey">,
): DragDropKeyboardCursorStep {
  if (event.altKey) return "fine";
  if (event.shiftKey) return "coarse";
  return "normal";
}

function markerFeedbackState(
  owner: OwnerState,
  marker: DragDropCourseMarker,
): "correct" | "incorrect" | "submitted" | null {
  if (owner.problem?.answerView === "correct") return "correct";
  const submitted = owner.problem?.state.submitted ?? false;
  const detail = owner.problem?.feedbackResult?.items?.[marker.id];
  if (detail && (submitted || owner.problem?.state.feedbackMode === "immediate")) {
    return detail.correct ? "correct" : "incorrect";
  }
  return submitted ? "submitted" : null;
}

function accessibleMarkerLabel(content: DragDropCourseContent, marker: DragDropCourseMarker) {
  if (content.markers.filter(({ label }) => label === marker.label).length <= 1)
    return marker.label;
  const index = content.markers.findIndex(({ id }) => id === marker.id);
  if (index < 0) throw new Error(`Marker "${marker.id}" is not present in its Course content.`);
  return `${marker.label}, marker ${index + 1} of ${content.markers.length}`;
}

function MarkerVisualView({
  marker,
  resolvedIcons,
}: {
  marker: DragDropCourseMarker;
  resolvedIcons: Readonly<Record<string, string>>;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const visual = marker.visual;
  if (visual.kind === "custom") {
    const src = resolvedIcons[visual.source.mediaId];
    if (src && !imageFailed) {
      return <img src={src} alt="" aria-hidden onError={() => setImageFailed(true)} />;
    }
    return (
      <span aria-hidden data-custom-icon-fallback="">
        ●
      </span>
    );
  }
  return <span aria-hidden>{presetSymbol(visual)}</span>;
}

function presetSymbol(visual: Extract<MarkerVisual, { kind: "preset" }>): string {
  const symbols: Record<MarkerPresetId, string> = {
    cross: "×",
    pin: "⌖",
    dot: "●",
    flag: "⚑",
    check: "✓",
  };
  return symbols[visual.preset];
}
