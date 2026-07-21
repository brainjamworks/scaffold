import { type Editor } from "@tiptap/react";
import { useMemo } from "react";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  createAlignmentTargetPort,
  type AlignmentTargetPort,
} from "@/editor/interactions/alignment/alignment-target";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";
import type { SurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-view-registry";
import { gridStructuralInteractionBubbleRendererBindings } from "@/editor/arrangements/grid/authoring/grid-bubble-controls";
import { layoutStructuralInteractionBubbleRendererBindings } from "@/editor/arrangements/layout/authoring/layout-bubble-controls";
import { createSurfaceStructuralInteractionBubbleRendererBinding } from "@/editor/surfaces/authoring/chrome/surface-bubble-controls";
import { BlockInteractionBubbleMenu } from "@/editor/shell/bubbles/interaction/BlockInteractionBubbleMenu";
import { StructuralInteractionBubbleMenu } from "@/editor/shell/bubbles/interaction/StructuralInteractionBubbleMenu";
import { createStructuralInteractionBubbleRendererMap } from "@/editor/interactions/interaction-bubble";
import { RichTextBubbleMenu } from "@/editor/shell/bubbles/rich-text/RichTextBubbleMenu";

import { InteractionSettingsSheetHost } from "../settings/sheets/InteractionSettingsSheetHost";

interface BubbleMenusProps {
  blockDefinitions: BlockDefinitionLookup;
  editor: Editor;
  surfaceAuthoringChrome: SurfaceAuthoringChromeResolver;
  surfaceVariants: SurfaceVariantLookup;
}

export function BubbleMenus({
  blockDefinitions,
  editor,
  surfaceAuthoringChrome,
  surfaceVariants,
}: BubbleMenusProps) {
  const alignmentTargetPort: AlignmentTargetPort = useMemo(
    () => createAlignmentTargetPort({ blockDefinitions, surfaceVariants }),
    [blockDefinitions, surfaceVariants],
  );
  const structuralRenderers = useMemo(
    () =>
      createStructuralInteractionBubbleRendererMap([
        ...gridStructuralInteractionBubbleRendererBindings,
        ...layoutStructuralInteractionBubbleRendererBindings,
        createSurfaceStructuralInteractionBubbleRendererBinding(surfaceAuthoringChrome),
      ]),
    [surfaceAuthoringChrome],
  );

  return (
    <>
      <BlockInteractionBubbleMenu
        blockDefinitions={blockDefinitions}
        alignmentTargetPort={alignmentTargetPort}
        editor={editor}
        pluginKey="scaffoldBlockInteractionBubbleMenu"
      />
      <StructuralInteractionBubbleMenu
        alignmentTargetPort={alignmentTargetPort}
        editor={editor}
        pluginKey="scaffoldStructuralInteractionBubbleMenu"
        renderers={structuralRenderers}
      />
      <RichTextBubbleMenu editor={editor} pluginKey="scaffoldRichTextBubbleMenu" />
      <InteractionSettingsSheetHost
        blockDefinitions={blockDefinitions}
        editor={editor}
        surfaceAuthoringChrome={surfaceAuthoringChrome}
      />
    </>
  );
}
