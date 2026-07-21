import type { NodeViewRenderer } from "@tiptap/core";
import { type ReactNodeViewProps } from "@tiptap/react";
import { Suspense, lazy, type ComponentType, type ReactElement } from "react";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { resolveActiveBoundedPlacementForNodeView } from "@/editor/bounded-containers/model/bounded-container-structure-policy";
import type { BlockDefinition } from "@/editor/blocks/block-definition";
import {
  createRuntimeBlockNodeView,
  type RuntimeBlockNodeViewOptions,
} from "@/runtime/foundation/node-views/runtime-block-node-view";

import { BlockRuntimeFrame } from "./BlockRuntimeFrame";

export type BlockRuntimeViewComponent<T = HTMLElement> = ComponentType<ReactNodeViewProps<T>>;

export type BlockRuntimeViewLoader<T = HTMLElement> = () => Promise<{
  default: BlockRuntimeViewComponent<T>;
}>;

export type BlockRuntimeViewDefinition<T = HTMLElement> =
  | {
      component: BlockRuntimeViewComponent<T>;
    }
  | {
      fallback?: BlockRuntimeViewComponent<T>;
      load: BlockRuntimeViewLoader<T>;
    };

export interface CreateBlockRuntimeNodeViewOptions<T = HTMLElement> extends Omit<
  RuntimeBlockNodeViewOptions,
  "frame" | "nodeType" | "projectFrame"
> {
  className?: string;
  definition: BlockDefinition;
  view: BlockRuntimeViewDefinition<T>;
}

export function createBlockRuntimeNodeView<T = HTMLElement>({
  className,
  definition,
  view,
  ...runtimeOptions
}: CreateBlockRuntimeNodeViewOptions<T>): NodeViewRenderer {
  const resolvedNodeType = definition.nodeType;
  const frameDefinition = definition.frame;
  const renderView = createViewRenderer(view);

  function GeneratedRuntimeNodeView(props: ReactNodeViewProps<T>) {
    const activeBoundedPlacement = resolveActiveBoundedPlacementForNodeView({
      blockDefinitions: builtInBlockRegistry,
      capability: definition.boundedPlacement,
      doc: props.editor.state.doc,
      getPos: props.getPos,
    });

    return (
      <BlockRuntimeFrame
        node={props.node}
        nodeType={resolvedNodeType}
        {...(activeBoundedPlacement ? { boundedPlacement: activeBoundedPlacement } : {})}
        {...(frameDefinition ? { frameDefinition } : {})}
        {...(runtimeOptions.frameKind ? { frameKind: runtimeOptions.frameKind } : {})}
        {...(className ? { className } : {})}
      >
        {renderView(props)}
      </BlockRuntimeFrame>
    );
  }

  GeneratedRuntimeNodeView.displayName = "GeneratedRuntimeNodeView";

  return createRuntimeBlockNodeView(GeneratedRuntimeNodeView, {
    ...runtimeOptions,
    ...(frameDefinition ? { frame: frameDefinition } : {}),
    nodeType: resolvedNodeType,
    projectFrame: false,
  });
}

function createViewRenderer<T>(
  view: BlockRuntimeViewDefinition<T>,
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
