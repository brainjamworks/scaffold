import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import type { Editor } from "@tiptap/core";

import { useInteractionDragSource } from "@/editor/interactions/drag/react/use-interaction-drag-source";
import type { AnyMovementIntent } from "../model/movement-intents";
import type { MovementNodeContext } from "../model/movement-policy";
import type { MovementTargetAxis } from "../model/movement-target";
import type { MovementCandidate } from "./movement-candidate";

export const AUTHORING_MOVEMENT_SILHOUETTE_ATTR = "data-authoring-movement-silhouette";
export const AUTHORING_MOVEMENT_SILHOUETTE_SURFACE_ATTR =
  "data-authoring-movement-silhouette-surface";
export const AUTHORING_MOVEMENT_ACTIVATION_ID_ATTR = "data-authoring-movement-activation-id";
export const AUTHORING_MOVEMENT_SNAPSHOT_CHROME_ATTR = "data-authoring-movement-snapshot-chrome";

const MAX_AUTHORING_MOVEMENT_PREVIEW_SIZE = 280;

export interface AuthoringMovementDragData {
  readonly axis: MovementTargetAxis;
  readonly containedMovement: boolean;
  readonly getPresentationElement: () => HTMLElement | null;
  readonly getSourcePos?: () => number | null | undefined;
  readonly label: string;
  readonly projection?: AuthoringContainedMovementProjection;
  readonly strategy?: AuthoringContainedMovementStrategy;
  readonly sourcePos: number | null | undefined;
}

export interface AuthoringContainedMovementStrategy {
  readonly keyboardNavigation?: "spatial";
  apply(editor: Editor, source: MovementNodeContext, intent: AnyMovementIntent): boolean;
  canApply(editor: Editor, source: MovementNodeContext, intent: AnyMovementIntent): boolean;
  canNavigateKeyboard?(
    source: MovementNodeContext,
    current: MovementNodeContext,
    target: MovementNodeContext,
    direction: "down" | "left" | "right" | "up",
  ): boolean;
  canTarget(source: MovementNodeContext, target: MovementNodeContext): boolean;
  describeDestination?(
    editor: Editor,
    source: MovementNodeContext,
    intent: AnyMovementIntent,
  ): string | null;
}

export interface AuthoringMovementSnapshot {
  readonly element: HTMLElement;
  readonly height: number;
  readonly scale: number;
  readonly sourceHeight: number;
  readonly sourceWidth: number;
  readonly width: number;
}

export interface AuthoringContainedMovementProjection {
  clear(): void;
  project(destinationIndex: number): void;
  projectAcrossOwners?(candidate: MovementCandidate, overlayHost: HTMLElement): void;
  start(sourceIndex: number): boolean;
}

interface AuthoringMovementDragSourceInput {
  readonly axis: MovementTargetAxis;
  readonly containedMovement: boolean;
  readonly disabled?: boolean;
  readonly getPresentationElement: () => HTMLElement | null;
  readonly getSourcePos?: () => number | null | undefined;
  readonly id: string;
  readonly label: string;
  readonly projection?: AuthoringContainedMovementProjection;
  readonly strategy?: AuthoringContainedMovementStrategy;
  readonly sourcePos: number | null | undefined;
}

export function authoringMovementSnapshotChromeAttributes(): Record<string, string> {
  return { [AUTHORING_MOVEMENT_SNAPSHOT_CHROME_ATTR]: "" };
}

export function authoringMovementSilhouetteSurfaceAttributes(): Record<string, string> {
  return { [AUTHORING_MOVEMENT_SILHOUETTE_SURFACE_ATTR]: "" };
}

export function useAuthoringMovementDragSource({
  axis,
  containedMovement,
  disabled = false,
  getPresentationElement,
  getSourcePos,
  id,
  label,
  projection,
  strategy,
  sourcePos,
}: AuthoringMovementDragSourceInput) {
  const getPresentationElementRef = useRef(getPresentationElement);
  const getSourcePosRef = useRef(getSourcePos);
  const sourceElementRef = useRef<HTMLElement | null>(null);
  getPresentationElementRef.current = getPresentationElement;
  getSourcePosRef.current = getSourcePos;

  const readPresentationElement = useCallback(() => getPresentationElementRef.current(), []);
  const readSourcePos = useCallback(() => getSourcePosRef.current?.(), []);
  const data = useMemo<AuthoringMovementDragData>(
    () => ({
      axis,
      containedMovement,
      getPresentationElement: readPresentationElement,
      ...(getSourcePos ? { getSourcePos: readSourcePos } : {}),
      label,
      ...(projection ? { projection } : {}),
      ...(strategy ? { strategy } : {}),
      sourcePos,
    }),
    [
      axis,
      containedMovement,
      getSourcePos,
      label,
      projection,
      readPresentationElement,
      readSourcePos,
      sourcePos,
      strategy,
    ],
  );
  const drag = useInteractionDragSource<AuthoringMovementDragData>({
    data,
    disabled,
    id,
    ...(strategy?.keyboardNavigation === "spatial" ? {} : { keyboardAxis: axis }),
    label,
  });
  const sourceRef = drag.sourceRef;
  const boundSourceRefRef = useRef(sourceRef);

  useEffect(() => {
    const nextElement = readPresentationElement();
    const previousElement = sourceElementRef.current;
    const previousSourceRef = boundSourceRefRef.current;
    if (previousSourceRef !== sourceRef) previousSourceRef(null);
    if (previousElement && previousElement !== nextElement) {
      previousElement.removeAttribute(AUTHORING_MOVEMENT_SILHOUETTE_ATTR);
    }
    boundSourceRefRef.current = sourceRef;
    sourceElementRef.current = nextElement;
    sourceRef(nextElement);
  });

  useLayoutEffect(() => {
    const sourceElement = sourceElementRef.current;
    if (!sourceElement) return;
    if (drag.isPlaceholder) {
      sourceElement.setAttribute(AUTHORING_MOVEMENT_SILHOUETTE_ATTR, "");
    } else {
      sourceElement.removeAttribute(AUTHORING_MOVEMENT_SILHOUETTE_ATTR);
    }
  });

  useLayoutEffect(() => {
    return () => {
      sourceElementRef.current?.removeAttribute(AUTHORING_MOVEMENT_SILHOUETTE_ATTR);
      sourceElementRef.current = null;
      boundSourceRefRef.current(null);
    };
  }, []);

  return { ...drag, activationId: id };
}

export function captureAuthoringMovementSnapshot(
  sourceElement: HTMLElement,
): AuthoringMovementSnapshot | null {
  if (!sourceElement.isConnected) return null;
  const rect = sourceElement.getBoundingClientRect();
  if (!positiveFinite(rect.width) || !positiveFinite(rect.height)) return null;

  const clone = sourceElement.cloneNode(true);
  if (!(clone instanceof sourceElement.ownerDocument.defaultView!.HTMLElement)) return null;

  copyComputedPresentation(sourceElement, clone);
  sanitizeSnapshot(clone);
  normalizeSnapshotRoot(clone, rect.width, rect.height);

  const scale = Math.min(
    1,
    MAX_AUTHORING_MOVEMENT_PREVIEW_SIZE / rect.width,
    MAX_AUTHORING_MOVEMENT_PREVIEW_SIZE / rect.height,
  );
  return Object.freeze({
    element: clone,
    height: rect.height * scale,
    scale,
    sourceHeight: rect.height,
    sourceWidth: rect.width,
    width: rect.width * scale,
  });
}

export function AuthoringMovementSnapshotPreview({
  snapshot,
}: {
  snapshot: AuthoringMovementSnapshot;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren(snapshot.element);
    return () => snapshot.element.remove();
  }, [snapshot]);

  const snapshotStyle: CSSProperties = {
    height: snapshot.height,
    overflow: "visible",
    pointerEvents: "none",
    width: snapshot.width,
  };
  const hostStyle: CSSProperties = {
    height: snapshot.sourceHeight,
    pointerEvents: "none",
    transform: `scale(${snapshot.scale})`,
    transformOrigin: "top left",
    width: snapshot.sourceWidth,
  };

  return (
    <div aria-hidden="true" inert data-authoring-movement-snapshot="" style={snapshotStyle}>
      <div ref={hostRef} style={hostStyle} />
    </div>
  );
}

function copyComputedPresentation(sourceRoot: HTMLElement, cloneRoot: HTMLElement): void {
  const ownerWindow = sourceRoot.ownerDocument.defaultView;
  if (!ownerWindow) return;
  const sourceElements = [sourceRoot, ...sourceRoot.querySelectorAll<HTMLElement>("*")];
  const cloneElements = [cloneRoot, ...cloneRoot.querySelectorAll<HTMLElement>("*")];

  for (let index = 0; index < sourceElements.length; index += 1) {
    const source = sourceElements[index];
    const clone = cloneElements[index];
    if (!source || !clone) continue;
    const computed = ownerWindow.getComputedStyle(source);
    for (let propertyIndex = 0; propertyIndex < computed.length; propertyIndex += 1) {
      const property = computed.item(propertyIndex);
      if (!property) continue;
      clone.style.setProperty(property, computed.getPropertyValue(property), "important");
    }
    copyRenderedControlState(source, clone);
  }
}

function copyRenderedControlState(source: HTMLElement, clone: HTMLElement): void {
  if (source.localName === "input" && clone.localName === "input") {
    const sourceInput = source as HTMLInputElement;
    const cloneInput = clone as HTMLInputElement;
    cloneInput.value = sourceInput.value;
    cloneInput.checked = sourceInput.checked;
  } else if (source.localName === "textarea" && clone.localName === "textarea") {
    const sourceTextArea = source as HTMLTextAreaElement;
    const cloneTextArea = clone as HTMLTextAreaElement;
    cloneTextArea.value = sourceTextArea.value;
    cloneTextArea.textContent = sourceTextArea.value;
  } else if (source.localName === "select" && clone.localName === "select") {
    (clone as HTMLSelectElement).value = (source as HTMLSelectElement).value;
  } else if (source.localName === "details" && clone.localName === "details") {
    (clone as HTMLDetailsElement).open = (source as HTMLDetailsElement).open;
  } else if (source.localName === "canvas" && clone.localName === "canvas") {
    const sourceCanvas = source as HTMLCanvasElement;
    const cloneCanvas = clone as HTMLCanvasElement;
    try {
      cloneCanvas.width = sourceCanvas.width;
      cloneCanvas.height = sourceCanvas.height;
      cloneCanvas.getContext("2d")?.drawImage(sourceCanvas, 0, 0);
    } catch {
      // A tainted canvas cannot be copied; its sized inert shell remains.
    }
  }
}

function sanitizeSnapshot(root: HTMLElement): void {
  for (const chrome of root.querySelectorAll<HTMLElement>(
    `[${AUTHORING_MOVEMENT_SNAPSHOT_CHROME_ATTR}]`,
  )) {
    chrome.remove();
  }

  const elements = [root, ...root.querySelectorAll<HTMLElement>("*")];
  for (const element of elements) {
    element.removeAttribute("id");
    element.removeAttribute("autofocus");
    element.removeAttribute(AUTHORING_MOVEMENT_SILHOUETTE_ATTR);
    element.setAttribute("contenteditable", "false");
    for (const attribute of [...element.attributes]) {
      if (attribute.name.startsWith("on") || ID_REFERENCE_ATTRIBUTES.has(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.matches("button, input, select, textarea, a[href], [tabindex]")) {
      element.tabIndex = -1;
    }
    element.style.setProperty("animation", "none", "important");
    element.style.setProperty("caret-color", "transparent", "important");
    element.style.setProperty("scroll-behavior", "auto", "important");
    element.style.setProperty("transition", "none", "important");
    freezeEmbeddedMedia(element);
  }

  root.setAttribute("aria-hidden", "true");
  root.setAttribute("draggable", "false");
  root.setAttribute("inert", "");
  root.style.setProperty("pointer-events", "none", "important");
  root.style.setProperty("user-select", "none", "important");
}

function freezeEmbeddedMedia(element: HTMLElement): void {
  if (element.matches("audio, video")) {
    element.removeAttribute("autoplay");
    element.setAttribute("preload", "none");
    try {
      (element as HTMLMediaElement).pause();
    } catch {
      // Some DOM implementations expose media without a working pause method.
    }
  }
  if (element.matches("iframe")) {
    element.removeAttribute("src");
    element.removeAttribute("srcdoc");
    element.setAttribute("sandbox", "");
  }
  if (element.matches("embed")) element.removeAttribute("src");
  if (element.matches("object")) element.removeAttribute("data");
}

function normalizeSnapshotRoot(root: HTMLElement, width: number, height: number): void {
  root.style.setProperty("bottom", "auto", "important");
  root.style.setProperty("height", `${height}px`, "important");
  root.style.setProperty("inset", "auto", "important");
  root.style.setProperty("left", "auto", "important");
  root.style.setProperty("margin", "0", "important");
  root.style.setProperty("max-height", "none", "important");
  root.style.setProperty("max-width", "none", "important");
  root.style.setProperty("min-height", "0", "important");
  root.style.setProperty("min-width", "0", "important");
  root.style.setProperty("position", "relative", "important");
  root.style.setProperty("right", "auto", "important");
  root.style.setProperty("top", "auto", "important");
  root.style.setProperty("transform", "none", "important");
  root.style.setProperty("width", `${width}px`, "important");
}

const ID_REFERENCE_ATTRIBUTES = new Set([
  "aria-activedescendant",
  "aria-controls",
  "aria-describedby",
  "aria-details",
  "aria-errormessage",
  "aria-flowto",
  "aria-labelledby",
  "aria-owns",
  "for",
  "form",
  "headers",
  "list",
]);

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
