import {
  CodeBlockDataSchema,
  type CodeBlockData,
  type CodeBlockLanguage,
} from "@scaffold/contracts";
import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { common, createLowlight } from "lowlight";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import { setTextSelectionNearInTransaction } from "@/editor/selection/selection-transactions";

import { CODE_BLOCK_BODY_NODE, CODE_BLOCK_NODE, emptyCodeBlockData } from "./content";

// The serializable language identifiers mirror lowlight's alphabetized `common` bundle.
const lowlight = createLowlight(common);
const codeBlockSyntaxPluginKey = new PluginKey("scaffoldCodeBlockSyntax");

interface HastChild {
  type: string;
  properties?: { className?: readonly string[] };
  children?: readonly HastChild[];
  value?: string;
}

function collectDecorations(
  nodes: readonly HastChild[],
  offset: number,
  classes: readonly string[],
  out: Decoration[],
): number {
  let cursor = offset;
  for (const child of nodes) {
    if (child.type === "text") {
      const length = child.value?.length ?? 0;
      if (length > 0 && classes.length > 0) {
        out.push(
          Decoration.inline(cursor, cursor + length, {
            class: classes.join(" "),
          }),
        );
      }
      cursor += length;
      continue;
    }

    if (child.type === "element" && child.children) {
      cursor = collectDecorations(
        child.children,
        cursor,
        [...classes, ...(child.properties?.className ?? [])],
        out,
      );
    }
  }
  return cursor;
}

function highlightLanguage(
  text: string,
  language: CodeBlockLanguage,
): { children: readonly HastChild[] } {
  if (language === "plaintext" || !lowlight.registered(language)) {
    return { children: [{ type: "text", value: text }] };
  }
  return lowlight.highlight(language, text) as {
    children: readonly HastChild[];
  };
}

function resolveCodeBlockData(node: ProseMirrorNode | null | undefined): CodeBlockData {
  const parsed = CodeBlockDataSchema.safeParse(node?.attrs["data"]);
  return parsed.success ? parsed.data : emptyCodeBlockData();
}

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== CODE_BLOCK_BODY_NODE || !node.textContent) return;

    const parent = doc.resolve(pos).parent;
    const data =
      parent.type.name === CODE_BLOCK_NODE ? resolveCodeBlockData(parent) : emptyCodeBlockData();
    const highlighted = highlightLanguage(node.textContent, data.language);
    collectDecorations(highlighted.children, pos + 1, [], decorations);
  });

  return DecorationSet.create(doc, decorations);
}

function CodeBlockSyntaxPlugin(): Plugin {
  return new Plugin({
    key: codeBlockSyntaxPluginKey,
    state: {
      init: (_, { doc }) => buildDecorations(doc),
      apply: (tr, oldDecorations) => {
        if (!tr.docChanged) return oldDecorations.map(tr.mapping, tr.doc);
        return buildDecorations(tr.doc);
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}

export interface CodeBlockNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createCodeBlockNode(options: CodeBlockNodeOptions = {}) {
  return Node.create({
    name: CODE_BLOCK_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: CODE_BLOCK_BODY_NODE,
    defining: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyCodeBlockData(),
          parseHTML: (element: HTMLElement) => {
            const raw = element.getAttribute("data-code-block");
            if (!raw) return emptyCodeBlockData();
            try {
              const parsed = CodeBlockDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyCodeBlockData();
            } catch {
              return emptyCodeBlockData();
            }
          },
          renderHTML: (attrs: { data: CodeBlockData }) => ({
            "data-code-block": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'section[data-node="code_block"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-node": "code_block" }), 0];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export interface CodeBlockBodyNodeOptions {
  keyboardShortcuts?: boolean;
}

export function createCodeBlockBodyNode(options: CodeBlockBodyNodeOptions = {}) {
  return Node.create({
    name: CODE_BLOCK_BODY_NODE,
    content: "text*",
    marks: "",
    code: true,
    defining: true,
    selectable: false,

    parseHTML() {
      return [
        {
          tag: 'pre[data-slot="code-block-body"]',
          preserveWhitespace: "full" as const,
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "pre",
        mergeAttributes(HTMLAttributes, {
          "data-slot": "code-block-body",
          class: "sc-code-block__pre",
        }),
        ["code", { class: "sc-code-block__content" }, 0],
      ];
    },

    addProseMirrorPlugins() {
      return [CodeBlockSyntaxPlugin()];
    },

    ...(options.keyboardShortcuts === false
      ? {}
      : {
          addKeyboardShortcuts() {
            return {
              Tab: () => {
                const { state, view } = this.editor;
                const { $from, empty } = state.selection;
                if (!empty || $from.parent.type !== this.type) return false;

                view.dispatch(state.tr.insertText("  "));
                return true;
              },
              ArrowDown: () => {
                const { state, view } = this.editor;
                const { $from, empty } = state.selection;
                if (!empty || $from.parent.type !== this.type) return false;
                if ($from.parentOffset !== $from.parent.nodeSize - 2) {
                  return false;
                }

                const outerDepth = $from.depth - 1;
                if (outerDepth < 0 || $from.node(outerDepth).type.name !== CODE_BLOCK_NODE) {
                  return false;
                }

                const afterOuter = $from.after(outerDepth);
                const tr = state.tr;
                if (!setTextSelectionNearInTransaction(tr, afterOuter, 1)) {
                  return false;
                }

                view.dispatch(tr.scrollIntoView());
                return true;
              },
            };
          },
        }),
  });
}

export const CodeBlockNode = createCodeBlockNode();
export const CodeBlockBodyNode = createCodeBlockBodyNode();
