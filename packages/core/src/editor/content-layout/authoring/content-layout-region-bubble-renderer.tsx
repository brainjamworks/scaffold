import type { Editor } from "@tiptap/react";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import type { StructuralChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import type { StructuralInteractionBubbleRendererBinding } from "@/editor/interactions/interaction-bubble";

import { ContentLayoutBubbleControls } from "./ContentLayoutBubbleControls";

export const contentLayoutRegionStructuralInteractionBubbleRendererBindings = Object.freeze([
  Object.freeze({
    kind: InteractionTargetKind.Region,
    renderer: renderRegionContentLayoutBubble,
  }),
] satisfies readonly StructuralInteractionBubbleRendererBinding[]);

function renderRegionContentLayoutBubble({
  descriptor,
  editor,
}: {
  readonly descriptor: StructuralChromeTargetDescriptor;
  readonly editor: Editor;
}) {
  if (descriptor.kind !== InteractionTargetKind.Region) return null;

  const regionId = EmbeddedNodeIdSchema.safeParse(descriptor.id);
  if (!regionId.success) return null;

  return <ContentLayoutBubbleControls containerId={regionId.data} editor={editor} />;
}
