/**
 * Custom Placeholder extension — decorates every empty node in the
 * document with `is-empty` (+ `is-editor-empty` when the editor is
 * empty as a whole) and a `data-placeholder` attribute consumed by
 * CSS in `styles/globals.css`.
 *
 * Replaces `@tiptap/extension-placeholder`. The official one in v3.24+
 * viewport-bounds its decoration computation, so empty nodes outside
 * the scroll viewport silently lose their placeholders. There's no
 * opt-out in the public API. Our composite assessment blocks
 * routinely span more than the viewport, so we run a full-doc
 * decoration pass each render instead.
 *
 * Performance: a full-doc walk is cheap for our content sizes; if
 * future docs grow large enough to matter we can layer caching or
 * revisit then. Until that's measured the simple version wins.
 */

import { Extension, isNodeEmpty } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface PlaceholderOptions {
  /** Class applied to the editor's first child when the editor is empty. */
  emptyEditorClass: string;
  /** Class applied to every empty node. */
  emptyNodeClass: string;
  /** Attribute name (will be prefixed `data-`). */
  dataAttribute: string;
  /** Placeholder text — string or function of `{ editor, node, pos, hasAnchor }`. */
  placeholder:
    | string
    | ((args: { editor: Editor; node: PMNode; pos: number; hasAnchor: boolean }) => string);
  /** Only show the placeholder when the editor is editable. */
  showOnlyWhenEditable: boolean;
  /** Only show placeholders on the empty node containing the selection. */
  showOnlyCurrent: boolean;
  /** Descend into nested nodes (e.g. inside NodeViews). */
  includeChildren: boolean;
}

const PLACEHOLDER_PLUGIN_KEY = new PluginKey("sc-placeholder");

export const Placeholder = Extension.create<PlaceholderOptions>({
  name: "placeholder",

  addOptions() {
    return {
      emptyEditorClass: "is-editor-empty",
      emptyNodeClass: "is-empty",
      dataAttribute: "placeholder",
      placeholder: "Write something …",
      showOnlyWhenEditable: true,
      showOnlyCurrent: true,
      includeChildren: false,
    };
  },

  addProseMirrorPlugins() {
    const { editor, options } = this;
    const dataAttr = `data-${options.dataAttribute}`;

    return [
      new Plugin({
        key: PLACEHOLDER_PLUGIN_KEY,
        props: {
          decorations({ doc, selection }) {
            if (options.showOnlyWhenEditable && !editor.isEditable) {
              return null;
            }

            const decorations: Decoration[] = [];
            const isEmptyDoc = editor.isEmpty;
            const { anchor } = selection;

            doc.descendants((node, pos) => {
              if (!node.type.isTextblock) {
                return options.includeChildren;
              }

              const hasAnchor = anchor >= pos && anchor <= pos + node.nodeSize;
              const isEmpty = isNodeEmpty(node);
              if (!isEmpty) return options.includeChildren;
              if (options.showOnlyCurrent && !hasAnchor) {
                return options.includeChildren;
              }

              const classes = [options.emptyNodeClass];
              if (isEmptyDoc) classes.push(options.emptyEditorClass);

              const placeholder =
                typeof options.placeholder === "function"
                  ? options.placeholder({ editor, node, pos, hasAnchor })
                  : options.placeholder;

              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: classes.join(" "),
                  [dataAttr]: placeholder,
                }),
              );

              return options.includeChildren;
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
