import type { NodeViewRenderer } from "@tiptap/core";
import { ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Suspense, lazy, type ComponentType, type ReactElement } from "react";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { resolveActiveBoundedPlacementForNodeView } from "@/editor/bounded-containers/model/bounded-container-structure-policy";
import type { BlockDefinition } from "@/editor/blocks/block-definition";

import { BlockAuthoringFrame } from "./BlockAuthoringFrame";
import {
  createTiptapResizableReactNodeView,
  type TiptapResizableReactNodeViewOptions,
} from "./tiptap-resizable-react-node-view";

export type BlockAuthoringViewComponent<T = HTMLElement> = ComponentType<ReactNodeViewProps<T>>;

export type BlockAuthoringViewLoader<T = HTMLElement> = () => Promise<{
  default: BlockAuthoringViewComponent<T>;
}>;

export type BlockAuthoringViewDefinition<T = HTMLElement> =
  | {
      component: BlockAuthoringViewComponent<T>;
    }
  | {
      fallback?: BlockAuthoringViewComponent<T>;
      load: BlockAuthoringViewLoader<T>;
    };

export interface CreateBlockAuthoringNodeViewOptions<T = HTMLElement> extends Omit<
  TiptapResizableReactNodeViewOptions,
  "blockDefinitions" | "frame" | "react"
> {
  className?: string;
  definition: BlockDefinition;
  view: BlockAuthoringViewDefinition<T>;
}

export function createBlockAuthoringNodeView<T = HTMLElement>({
  className,
  definition,
  view,
  ...resizableOptions
}: CreateBlockAuthoringNodeViewOptions<T>): NodeViewRenderer {
  const resolvedNodeType = definition.nodeType;
  const frameDefinition = definition.frame;
  const renderView = createViewRenderer(view);

  function GeneratedAuthoringNodeView(props: ReactNodeViewProps<T>) {
    const activeBoundedPlacement = resolveActiveBoundedPlacementForNodeView({
      blockDefinitions: builtInBlockRegistry,
      capability: definition.boundedPlacement,
      doc: props.editor.state.doc,
      getPos: props.getPos,
    });

    return (
      <BlockAuthoringFrame
        node={props.node}
        nodeType={resolvedNodeType}
        {...(activeBoundedPlacement ? { boundedPlacement: activeBoundedPlacement } : {})}
        {...(frameDefinition ? { frameDefinition } : {})}
        {...(className ? { className } : {})}
      >
        {renderView(props)}
      </BlockAuthoringFrame>
    );
  }

  GeneratedAuthoringNodeView.displayName = "GeneratedAuthoringNodeView";

  if (frameDefinition?.resizable) {
    return createTiptapResizableReactNodeView(GeneratedAuthoringNodeView, {
      blockDefinitions: builtInBlockRegistry,
      ...resizableOptions,
      ...(definition.boundedPlacement ? { boundedPlacement: definition.boundedPlacement } : {}),
      frame: frameDefinition,
    });
  }

  return ReactNodeViewRenderer(GeneratedAuthoringNodeView);
}

function createViewRenderer<T>(
  view: BlockAuthoringViewDefinition<T>,
): (props: ReactNodeViewProps<T>) => ReactElement {
  if ("component" in view) {
    const View = view.component;
    return (props) => <View {...props} />;
  }

  const LazyView = lazy(view.load);
  const Fallback = view.fallback;

  return (props) => (
    <Suspense fallback={Fallback ? <Fallback {...props} /> : null}>
      <LazyView {...props} />
    </Suspense>
  );
}
