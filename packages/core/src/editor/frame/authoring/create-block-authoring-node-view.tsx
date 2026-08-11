import type { NodeViewRenderer } from "@tiptap/core";
import { ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Suspense, lazy, type ComponentType, type ReactElement } from "react";

import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import {
  mayHaveBoundedContainerParentForNodeView,
  resolveActiveBoundedPlacementForNodeView,
} from "@/editor/bounded-containers/model/bounded-container-placement";
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
  "blockDefinitions" | "frame" | "layoutDefinitions" | "react"
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
  const ownerDefinitionLookup = Object.freeze({
    getByNodeType: (nodeType: string) =>
      nodeType === definition.nodeType ? definition : undefined,
  });

  function GeneratedAuthoringNodeView(props: ReactNodeViewProps<T>) {
    const capabilities =
      definition.boundedPlacement &&
      mayHaveBoundedContainerParentForNodeView({
        doc: props.editor.state.doc,
        getPos: props.getPos,
      })
      ? getScaffoldCapabilitiesForEditor(props.editor)
      : null;
    const activeBoundedPlacement = capabilities
      ? resolveActiveBoundedPlacementForNodeView({
          blockDefinitions: capabilities.blocks.registry,
          capability: definition.boundedPlacement,
          doc: props.editor.state.doc,
          getPos: props.getPos,
          layoutDefinitions: capabilities.layouts.registry,
        })
      : undefined;

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
      ...resizableOptions,
      blockDefinitions: ownerDefinitionLookup,
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
