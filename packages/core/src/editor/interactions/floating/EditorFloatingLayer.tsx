import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";

import "./editor-floating.css";

import type { EditorFloatingLayerKind } from "./editor-floating-layer-kind";

export {
  AUTHORING_EDITOR_FLOATING_LAYER_KIND,
  type EditorFloatingLayerKind,
} from "./editor-floating-layer-kind";

export interface EditorFloatingLayerEditor {
  view: {
    dom: Element;
  };
}

export interface EditorFloatingLayerProps {
  children: ReactNode;
  className?: string;
  editor: EditorFloatingLayerEditor;
  kind?: EditorFloatingLayerKind;
}

const EditorFloatingLayerContext = createContext<HTMLElement | null>(null);

const editorFloatingLayers = new WeakMap<Element, Map<EditorFloatingLayerKind, HTMLElement>>();
type EditorFloatingLayerRootListener = (root: HTMLElement | null) => void;
const editorFloatingLayerRootListeners = new WeakMap<
  Element,
  Map<EditorFloatingLayerKind, Set<EditorFloatingLayerRootListener>>
>();

export function EditorFloatingLayer({
  children,
  className,
  editor,
  kind,
}: EditorFloatingLayerProps) {
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  const ownerDocument = editor.view.dom.ownerDocument;
  const overlayBoundaryResolution = useOverlayBoundary();

  useEffect(() => {
    if (!kind || !portalRoot) return;

    return registerEditorFloatingLayerRoot(editor.view.dom, kind, portalRoot);
  }, [editor.view.dom, kind, portalRoot]);

  if (overlayBoundaryResolution.status === "pending") return null;

  const portalTarget =
    overlayBoundaryResolution.status === "ready"
      ? overlayBoundaryResolution.environment.host
      : ownerDocument.body;

  if (!portalTarget) return null;

  return (
    <EditorFloatingLayerContext.Provider value={portalRoot}>
      {children}
      {createPortal(
        <div
          className={joinClassNames("sc-editor-floating-layer", className)}
          data-scaffold-overlay-click-through-root=""
          data-scaffold-editor-floating-layer=""
          {...(kind ? { "data-scaffold-editor-floating-layer-kind": kind } : {})}
          ref={setPortalRoot}
        />,
        portalTarget,
      )}
    </EditorFloatingLayerContext.Provider>
  );
}

export function useEditorFloatingLayerRoot(): HTMLElement | null {
  return useContext(EditorFloatingLayerContext);
}

export function resolveEditorFloatingLayerRoot(
  editor: EditorFloatingLayerEditor,
  kind: EditorFloatingLayerKind,
): HTMLElement | null {
  return editorFloatingLayers.get(editor.view.dom)?.get(kind) ?? null;
}

export function subscribeEditorFloatingLayerRoot(
  editor: EditorFloatingLayerEditor,
  kind: EditorFloatingLayerKind,
  listener: EditorFloatingLayerRootListener,
): () => void {
  const editorDom = editor.view.dom;
  let listenersByKind = editorFloatingLayerRootListeners.get(editorDom);
  if (!listenersByKind) {
    listenersByKind = new Map();
    editorFloatingLayerRootListeners.set(editorDom, listenersByKind);
  }

  let listeners = listenersByKind.get(kind);
  if (!listeners) {
    listeners = new Set();
    listenersByKind.set(kind, listeners);
  }

  listeners.add(listener);
  const currentRoot = editorFloatingLayers.get(editorDom)?.get(kind);
  if (currentRoot) listener(currentRoot);

  return () => {
    const currentListenersByKind = editorFloatingLayerRootListeners.get(editorDom);
    const currentListeners = currentListenersByKind?.get(kind);
    if (!currentListeners) return;

    currentListeners.delete(listener);
    if (currentListeners.size === 0) currentListenersByKind?.delete(kind);
    if (currentListenersByKind?.size === 0) {
      editorFloatingLayerRootListeners.delete(editorDom);
    }
  };
}

function registerEditorFloatingLayerRoot(
  editorDom: Element,
  kind: EditorFloatingLayerKind,
  root: HTMLElement,
): () => void {
  let layers = editorFloatingLayers.get(editorDom);
  if (!layers) {
    layers = new Map();
    editorFloatingLayers.set(editorDom, layers);
  }

  layers.set(kind, root);
  for (const listener of editorFloatingLayerRootListeners.get(editorDom)?.get(kind) ?? []) {
    listener(root);
  }

  return () => {
    const currentLayers = editorFloatingLayers.get(editorDom);
    if (!currentLayers || currentLayers.get(kind) !== root) return;

    currentLayers.delete(kind);
    if (currentLayers.size === 0) {
      editorFloatingLayers.delete(editorDom);
    }
    for (const listener of editorFloatingLayerRootListeners.get(editorDom)?.get(kind) ?? []) {
      listener(null);
    }
  };
}

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}
