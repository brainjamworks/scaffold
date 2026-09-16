import { Extension, type Extensions } from "@tiptap/core";

import {
  createScopedLayerEditingContextExtension,
  readLayerEditingContextForState,
} from "@/document/authoring/layers/layer-editing-boundaries";
import {
  allowsLayerEditingTransaction,
  type LayerEditingContext,
} from "@/document/model/layers/layer-editing-policy";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { NESTED_RICH_TEXT_EXTERNAL_SYNC_META } from "@/editor/prosemirror/nested-rich-text-editor/map-inner-transaction-to-outer";

/**
 * Adds Layer ownership to a deliberately detached block-capable content editor.
 * The guard runs before the content bridge, so refused author edits are never
 * published to the outer document. Authoritative bridge synchronization is
 * applied normally so the scoped owner map can reconcile to the incoming doc.
 */
export function createNestedLayerAuthoringExtensions({
  blockDefinitions,
  layoutDefinitions,
  openLayerByOwnerId,
}: {
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly layoutDefinitions: LayoutRegistry;
  readonly openLayerByOwnerId: LayerEditingContext["openLayerByOwnerId"];
}): Extensions {
  return [
    createScopedLayerEditingContextExtension({
      blockDefinitions,
      layoutDefinitions,
      openLayerByOwnerId,
    }),
    Extension.create({
      name: "nestedLayerEditingBoundary",
      priority: 2_000,

      dispatchTransaction({ transaction, next }) {
        if (transaction.getMeta(NESTED_RICH_TEXT_EXTERNAL_SYNC_META) === true) {
          next(transaction);
          return;
        }

        const context = readLayerEditingContextForState(
          this.editor.state,
          layoutDefinitions,
          blockDefinitions,
        );
        if (!context?.blockDefinitions) {
          throw new Error("Nested Layer authoring requires its scoped Layer context.");
        }
        if (
          allowsLayerEditingTransaction({
            ...context,
            transaction,
            documentBefore: this.editor.state.doc,
          })
        ) {
          next(transaction);
        }
      },
    }),
  ];
}
