import { type Editor, type NodeViewRenderer, type NodeViewRendererProps } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Decoration, DecorationSource, NodeView, ViewMutationRecord } from "@tiptap/pm/view";
import {
  ReactNodeView,
  type ReactNodeViewProps,
  type ReactNodeViewRendererOptions,
} from "@tiptap/react";
import type { ComponentType } from "react";

import type { BlockFrameDefinition } from "@/editor/blocks/block-definition";
import { applyBlockFrameStyle, normalizeBlockFrame } from "@/editor/frame/model/block-frame";
import { RUNTIME_FRAME_ATTR } from "@/editor/frame/runtime/frame-projection";

export interface RuntimeBlockNodeViewOptions {
  frame?: BlockFrameDefinition;
  frameKind?: string;
  nodeType?: string;
  projectFrame?: boolean;
  react?: Partial<ReactNodeViewRendererOptions>;
}

type EditorWithReactContent = Editor & {
  contentComponent?: unknown;
};

const FRAME_ATTR = "data-frame";

export function createRuntimeBlockNodeView<T = HTMLElement>(
  Component: ComponentType<ReactNodeViewProps<T>>,
  options: RuntimeBlockNodeViewOptions = {},
): NodeViewRenderer {
  return (props) => {
    if (!hasReactContentComponent(props.editor)) {
      return {} as NodeView;
    }

    return new ScaffoldRuntimeBlockNodeView(Component, props, options);
  };
}

class ScaffoldRuntimeBlockNodeView<T = HTMLElement> implements NodeView {
  private currentNode: PMNode;
  private readonly frameDefinition: BlockFrameDefinition | undefined;
  private readonly reactNodeView: ReactNodeView<T>;

  constructor(
    Component: ComponentType<ReactNodeViewProps<T>>,
    props: NodeViewRendererProps,
    private readonly options: RuntimeBlockNodeViewOptions,
  ) {
    this.currentNode = props.node;
    this.frameDefinition = options.frame;
    this.reactNodeView = new ReactNodeView<T>(Component, props, options.react);
    if (this.shouldProjectFrame()) this.applyRuntimeFrame();
  }

  get dom(): HTMLElement {
    return this.reactNodeView.dom;
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

    const accepted = this.reactNodeView.update(node, decorations, innerDecorations);
    if (!accepted) return false;

    this.currentNode = node;
    if (this.shouldProjectFrame()) this.applyRuntimeFrame();
    return true;
  }

  selectNode(): void {
    this.reactNodeView.selectNode();
  }

  deselectNode(): void {
    this.reactNodeView.deselectNode();
  }

  stopEvent(event: Event): boolean {
    return this.reactNodeView.stopEvent(event);
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return this.reactNodeView.ignoreMutation(mutation);
  }

  destroy(): void {
    this.reactNodeView.destroy();
  }

  private applyRuntimeFrame(): void {
    const element = this.resolveRuntimeFrameElement();
    this.clearReactWrapperRuntimeFrame(element);
    element.setAttribute(RUNTIME_FRAME_ATTR, this.options.frameKind ?? "block");
    element.setAttribute("data-id", String(this.currentNode.attrs["id"] ?? ""));

    const frame = this.currentNode.attrs["frame"];
    if (frame) {
      element.setAttribute(FRAME_ATTR, JSON.stringify(normalizeBlockFrame(frame)));
    } else {
      element.removeAttribute(FRAME_ATTR);
    }

    applyBlockFrameStyle(element, frame, this.frameDefinition);
  }

  private shouldProjectFrame(): boolean {
    return this.options.projectFrame !== false;
  }

  private resolveRuntimeFrameElement(): HTMLElement {
    const root = this.reactNodeView.dom;
    const nodeType = this.options.nodeType ?? this.currentNode.type.name;
    const byNode = root.querySelector(`[data-node="${cssEscape(nodeType)}"]`);
    if (byNode instanceof HTMLElement) return byNode;

    const firstChild = root.firstElementChild;
    return firstChild instanceof HTMLElement ? firstChild : root;
  }

  private clearReactWrapperRuntimeFrame(frameElement: HTMLElement): void {
    const root = this.reactNodeView.dom;
    if (root === frameElement) return;

    root.removeAttribute(RUNTIME_FRAME_ATTR);
    root.removeAttribute("data-id");
    root.removeAttribute(FRAME_ATTR);
    clearFrameStyle(root);
  }
}

function hasReactContentComponent(editor: Editor): editor is EditorWithReactContent {
  return Boolean((editor as EditorWithReactContent).contentComponent);
}

function clearFrameStyle(element: HTMLElement): void {
  element.style.aspectRatio = "";
  element.style.height = "";
  element.style.maxWidth = "";
  element.style.marginLeft = "";
  element.style.marginRight = "";
  element.style.width = "";
}

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&");
}
