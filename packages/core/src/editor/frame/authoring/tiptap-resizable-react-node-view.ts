import {
  ResizableNodeView,
  type Editor,
  type NodeViewRenderer,
  type NodeViewRendererProps,
  type ResizableNodeDimensions,
  type ResizableNodeViewDirection,
} from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Decoration, DecorationSource, NodeView, ViewMutationRecord } from "@tiptap/pm/view";
import {
  ReactNodeView,
  type ReactNodeViewProps,
  type ReactNodeViewRendererOptions,
} from "@tiptap/react";
import type { ComponentType } from "react";

import "./resize/resize-frame.css";

import { resolveActiveBoundedPlacementForNodeView } from "@/editor/bounded-containers/model/bounded-container-structure-policy";
import type { BlockFrameDefinition } from "@/editor/blocks/block-definition";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import type { BoundedPlacement } from "../model/bounded-placement";
import { resizeBlockFrame, setBlockFrameAt } from "../model/block-frame";
import {
  resolveAuthoringPresentationScale,
  resolveFrameAspectRatio,
  resolveParentWidth,
} from "./frame-sizing";
import { applyNodeViewFrameStyle } from "./node-view-frame-style";
import { resolveNodeViewBlockElement, syncNodeViewResizeChrome } from "./resize/resize-chrome";
import { ResizeGestureSession } from "./resize/resize-gesture-session";
import {
  applyReactNodeViewElementDefaults,
  applyResizableNodeViewDomDefaults,
} from "./resizable-node-view-dom";
import {
  createResizeHandle,
  DEFAULT_RESIZE_HANDLE_DIRECTIONS,
  isResizeHandleEvent,
} from "./resize/resize-handle";

export interface TiptapResizableReactNodeViewOptions {
  blockDefinitions: BlockDefinitionLookup;
  boundedPlacement?: BoundedPlacement;
  directions?: ResizableNodeViewDirection[];
  frame?: BlockFrameDefinition;
  min?: Partial<ResizableNodeDimensions>;
  react?: Partial<ReactNodeViewRendererOptions>;
}

type EditorWithReactContent = Editor & {
  contentComponent?: unknown;
};

export function createTiptapResizableReactNodeView<T = HTMLElement>(
  Component: ComponentType<ReactNodeViewProps<T>>,
  options: TiptapResizableReactNodeViewOptions,
): NodeViewRenderer {
  // This wrapper is for structured React block NodeViews whose editable
  // content lives in child nodes or field containers. Native textblock-style
  // nodes (`content: 'text*'`, e.g. code blocks) need a direct ProseMirror
  // contentDOM and should not be routed through this resizable React wrapper.
  return (props) => {
    if (!hasReactContentComponent(props.editor)) {
      return {} as NodeView;
    }

    return new ScaffoldResizableReactNodeView(Component, props, options);
  };
}

class ScaffoldResizableReactNodeView<T = HTMLElement> implements NodeView {
  private currentNode: PMNode;
  private editorHasFocus = false;
  private readonly boundedPlacementCapability: BoundedPlacement | undefined;
  private readonly blockDefinitions: BlockDefinitionLookup;
  private readonly frameDefinition: BlockFrameDefinition | undefined;
  private cancelPendingFrameSync: (() => void) | null = null;
  private readonly reactNodeView: ReactNodeView<T>;
  private readonly resizable: ResizableNodeView;
  private readonly resizeGesture: ResizeGestureSession;
  private resizeGestureStart: (ResizableNodeDimensions & { scale: number }) | null = null;

  constructor(
    Component: ComponentType<ReactNodeViewProps<T>>,
    private readonly props: NodeViewRendererProps,
    options: TiptapResizableReactNodeViewOptions,
  ) {
    this.currentNode = props.node;
    this.blockDefinitions = options.blockDefinitions;
    this.editorHasFocus = props.editor.view.hasFocus();
    this.boundedPlacementCapability = options.boundedPlacement;
    this.frameDefinition = options.frame;
    this.resizeGesture = new ResizeGestureSession({
      editor: props.editor,
      onCancel: () => {
        this.resizeGestureStart = null;
        this.applyPersistedFrameStyle();
        this.syncResizeChrome();
      },
    });

    this.reactNodeView = new ReactNodeView<T>(Component, props, options.react);

    const element = this.reactNodeView.dom;
    applyReactNodeViewElementDefaults(element);

    const contentElement = this.reactNodeView.contentDOM ?? undefined;

    this.resizable = new ResizableNodeView({
      ...(contentElement ? { contentElement } : {}),
      editor: props.editor,
      element,
      getPos: props.getPos,
      node: this.currentNode,
      onCommit: (width, height) => this.commitResize(width, height),
      onResize: (width, height) => this.previewResize(width, height),
      onUpdate: (
        node: PMNode,
        decorations: readonly Decoration[],
        innerDecorations: DecorationSource,
      ) => this.updateReactNodeView(node, decorations, innerDecorations),
      options: {
        directions: options.directions ?? DEFAULT_RESIZE_HANDLE_DIRECTIONS,
        min: options.min ?? { height: 48, width: 120 },
        preserveAspectRatio: Boolean(this.frameDefinition?.preserveAspectRatio),
        createCustomHandle: createResizeHandle,
      },
    });

    this.resizable.wrapper.addEventListener("mousedown", this.captureResizeGestureStart, true);
    this.resizable.wrapper.addEventListener("touchstart", this.captureResizeGestureStart, true);

    this.syncBoundedPlacement();
    this.applyPersistedFrameStyle();
    this.queueFrameSync();
    this.syncResizeChrome();
    props.editor.on("update", this.handleEditorUpdate);
    props.editor.on("selectionUpdate", this.syncResizeChrome);
    props.editor.on("focus", this.handleEditorFocus);
    props.editor.on("blur", this.handleEditorBlur);
    props.editor.on("transaction", this.handleEditorTransaction);
  }

  get dom(): HTMLElement {
    return this.resizable.dom;
  }

  get contentDOM(): HTMLElement | null {
    return this.reactNodeView.contentDOM;
  }

  update(
    node: PMNode,
    decorations: readonly Decoration[],
    innerDecorations: DecorationSource,
  ): boolean {
    if (node.type !== this.currentNode.type) return false;
    return this.resizable.update(node, decorations, innerDecorations);
  }

  selectNode(): void {
    this.reactNodeView.selectNode();
    this.syncResizeChrome();
  }

  deselectNode(): void {
    this.reactNodeView.deselectNode();
    this.syncResizeChrome();
  }

  stopEvent(event: Event): boolean {
    if (isResizeHandleEvent(event)) return true;
    return this.reactNodeView.stopEvent(event);
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return this.reactNodeView.ignoreMutation(mutation);
  }

  destroy(): void {
    this.props.editor.off("update", this.handleEditorUpdate);
    this.props.editor.off("selectionUpdate", this.syncResizeChrome);
    this.props.editor.off("focus", this.handleEditorFocus);
    this.props.editor.off("blur", this.handleEditorBlur);
    this.props.editor.off("transaction", this.handleEditorTransaction);
    this.resizeGesture.destroy();
    this.resizable.wrapper.removeEventListener("mousedown", this.captureResizeGestureStart, true);
    this.resizable.wrapper.removeEventListener("touchstart", this.captureResizeGestureStart, true);
    if (this.cancelPendingFrameSync) {
      this.cancelPendingFrameSync();
      this.cancelPendingFrameSync = null;
    }
    this.reactNodeView.destroy();
    this.resizable.destroy();
  }

  private updateReactNodeView(
    node: PMNode,
    decorations: readonly Decoration[],
    innerDecorations: DecorationSource,
  ): boolean {
    const accepted = this.reactNodeView.update(node, decorations, innerDecorations);
    if (!accepted) return false;

    this.currentNode = node;
    this.syncBoundedPlacement();
    this.applyPersistedFrameStyle();
    this.queueFrameSync();
    this.syncResizeChrome();
    return true;
  }

  private commitResize(width: number, height: number): void {
    if (this.frameDefinition?.resizable === false) {
      this.resizeGesture.clear();
      this.resizeGestureStart = null;
      return;
    }

    const pos = this.props.getPos();
    if (typeof pos !== "number") {
      this.resizeGesture.clear();
      this.resizeGestureStart = null;
      return;
    }

    const normalizedSize = this.normalizeResizeSize(width, height);
    const resizeWidth = this.resizeGesture.liveSize?.width ?? normalizedSize.width;
    const resizeHeight = this.resizeGesture.liveSize?.height ?? normalizedSize.height;
    const parentWidthPx = resolveParentWidth(this.resizable.dom, resizeWidth);
    const aspectRatio = resolveFrameAspectRatio(resizeWidth, resizeHeight, this.frameDefinition);
    const resizeInput = {
      aspectRatio,
      desiredHeightPx: resizeHeight,
      desiredWidthPx: resizeWidth,
      parentWidthPx,
      preserveAspectRatio: Boolean(this.frameDefinition?.preserveAspectRatio),
    };
    const resized = resizeBlockFrame(
      this.currentNode.attrs["frame"],
      this.frameDefinition ? { ...resizeInput, definition: this.frameDefinition } : resizeInput,
    );

    this.resizeGesture.clear();
    this.resizeGestureStart = null;
    this.applyPersistedFrameStyle();
    setBlockFrameAt(this.props.editor, pos, resized.attrs);
  }

  private syncBoundedPlacement(): void {
    const activeBoundedPlacement = resolveActiveBoundedPlacementForNodeView({
      blockDefinitions: this.blockDefinitions,
      capability: this.boundedPlacementCapability,
      doc: this.props.editor.state.doc,
      getPos: this.props.getPos,
    });
    applyResizableNodeViewDomDefaults({
      ...(activeBoundedPlacement ? { boundedPlacement: activeBoundedPlacement } : {}),
      dom: this.resizable.dom,
      wrapper: this.resizable.wrapper,
    });
  }

  private syncResizeChrome = (): void => {
    syncNodeViewResizeChrome({
      blockDefinitions: this.blockDefinitions,
      editor: this.props.editor,
      editorHasFocus: this.editorHasFocus,
      frameDefinition: this.frameDefinition,
      getPos: this.props.getPos,
      node: this.currentNode,
      wrapper: this.resizable.wrapper,
    });
  };

  private handleEditorTransaction = (): void => {
    this.syncBoundedPlacement();
    this.queueFrameSync();
    this.syncResizeChrome();
  };

  private handleEditorFocus = (): void => {
    this.editorHasFocus = true;
    this.syncResizeChrome();
  };

  private handleEditorBlur = (): void => {
    this.editorHasFocus = false;
    this.syncResizeChrome();
  };

  private handleEditorUpdate = (): void => {
    this.syncResizeChrome();
  };

  private previewResize(width: number, height: number): void {
    if (this.frameDefinition?.resizable === false) return;

    this.resizeGesture.preview(this.normalizeResizeSize(width, height));
    this.applyPersistedFrameStyle();
    this.syncResizeChrome();
  }

  private captureResizeGestureStart = (event: Event): void => {
    if (!isResizeHandleEvent(event)) return;

    this.resizeGestureStart = {
      height: this.reactNodeView.dom.offsetHeight,
      scale: resolveAuthoringPresentationScale(this.resizable.dom),
      width: this.reactNodeView.dom.offsetWidth,
    };
  };

  private normalizeResizeSize(width: number, height: number): ResizableNodeDimensions {
    const start = this.resizeGestureStart;
    if (!start || start.scale === 1) return { width, height };

    return {
      width: start.width + (width - start.width) / start.scale,
      height: start.height + (height - start.height) / start.scale,
    };
  }

  private applyPersistedFrameStyle(): void {
    applyNodeViewFrameStyle({
      blockElement: this.resolveBlockElement(),
      definition: this.frameDefinition,
      frame: this.currentNode.attrs["frame"],
      liveSize: this.resizeGesture.liveSize,
      nodeViewElement: this.reactNodeView.dom,
      resizableDom: this.resizable.dom,
      wrapper: this.resizable.wrapper,
    });
  }

  private resolveBlockElement(): HTMLElement | null {
    return resolveNodeViewBlockElement(this.reactNodeView.dom, {
      blockDefinitions: this.blockDefinitions,
      getPos: this.props.getPos,
      node: this.currentNode,
    });
  }

  private queueFrameSync(): void {
    if (this.cancelPendingFrameSync) return;

    const sync = () => {
      this.cancelPendingFrameSync = null;
      this.applyPersistedFrameStyle();
      this.syncResizeChrome();
    };

    if (typeof requestAnimationFrame === "function") {
      const id = requestAnimationFrame(sync);
      this.cancelPendingFrameSync = () => cancelAnimationFrame(id);
      return;
    }

    const id = window.setTimeout(sync, 0);
    this.cancelPendingFrameSync = () => window.clearTimeout(id);
  }
}

function hasReactContentComponent(editor: Editor): editor is EditorWithReactContent {
  return Boolean((editor as EditorWithReactContent).contentComponent);
}
