import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  insertCatalogItemChecked,
  type InsertActionCheckedRange,
} from "@/editor/insertion/checked-insertion";
import type { InsertAction } from "@/editor/insertion/insert-action";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";
import { resolveAuthoringInteractionRoot } from "@/editor/interactions/dom/authoring-root";
import {
  AUTHORING_EDITOR_FLOATING_LAYER_KIND,
  resolveEditorFloatingLayerRoot,
  subscribeEditorFloatingLayerRoot,
} from "@/editor/interactions/floating/EditorFloatingLayer";
import {
  createOverlayFloatingPositioner,
  type OverlayFloatingPositioner,
  type OverlayFloatingPositionerEnvironment,
  type OverlayFloatingReference,
} from "@/editor/interactions/floating/overlay-floating-positioner";
import { zIndex } from "@/ui/overlays/z-index";

import { canInsertCatalogItem, getInsertableCatalogItems } from "../insert/insert-availability";
import { searchSlashItems, type SlashItem } from "../insert/items";
import { SlashMenu, type SlashMenuHandle } from "./SlashMenu";

export interface SlashCommandOptions {
  items: readonly InsertAction[];
  surfaceVariants: SurfaceVariantLookup;
}

export function getSlashCommandItems(
  editor: Editor,
  query: string,
  items: readonly InsertAction[],
): SlashItem[] {
  const insertableItems = getInsertableCatalogItems(editor, items);
  return searchSlashItems(insertableItems, query).slice(0, 10);
}

export function insertSlashCommandItem(
  editor: Editor,
  range: InsertActionCheckedRange,
  item: SlashItem,
  blockDefinitions: BlockDefinitionLookup,
  surfaceVariants: SurfaceVariantLookup,
): boolean {
  if (!canInsertCatalogItem(editor, item)) return false;
  return insertCatalogItemChecked(editor, item, blockDefinitions, surfaceVariants, range);
}

export const SlashCommandPluginKey = new PluginKey("slash-command");

export function isSlashCommandActive(state: EditorState): boolean {
  return Boolean(SlashCommandPluginKey.getState(state)?.active);
}

export function resolveSlashCommandPopupTarget(editor: Editor): HTMLElement | null {
  return resolveEditorFloatingLayerRoot(editor, AUTHORING_EDITOR_FLOATING_LAYER_KIND);
}

function resolveSlashCommandPopupEnvironment(
  editor: Editor,
  container: HTMLElement | null,
): OverlayFloatingPositionerEnvironment | null {
  if (container === null || !container.isConnected) return null;

  const boundaryHost = container.parentElement;
  if (boundaryHost?.dataset.scaffoldOverlayHost === undefined) return null;

  const ownerDocument = container.ownerDocument;
  if (ownerDocument.defaultView === null || editor.view.dom.ownerDocument !== ownerDocument) {
    return null;
  }

  const boundaryKind = boundaryHost.dataset.kind;
  if (boundaryKind !== "contained" && boundaryKind !== "viewport") return null;

  const collisionBoundary =
    boundaryKind === "contained"
      ? (resolveAuthoringInteractionRoot(editor.view.dom) ?? boundaryHost.parentElement)
      : null;
  if (boundaryKind === "contained" && collisionBoundary === null) return null;

  return {
    collisionBoundary,
    container,
    ownerDocument,
    strategy: boundaryKind === "viewport" ? "fixed" : "absolute",
  };
}

function slashCommandReference(
  editor: Editor,
  clientRect: (() => DOMRect | null) | null | undefined,
): OverlayFloatingReference | null {
  if (!clientRect) return null;
  return {
    contextElement: editor.view.dom,
    getBoundingClientRect: clientRect,
  };
}

export function createSlashCommand({ items, surfaceVariants }: SlashCommandOptions) {
  return Extension.create({
    name: "slashCommand",

    addProseMirrorPlugins() {
      return [
        Suggestion({
          pluginKey: SlashCommandPluginKey,
          editor: this.editor,
          char: "/",
          startOfLine: false,
          allowSpaces: false,
          allowedPrefixes: null,
          items: ({ editor, query }): SlashItem[] => {
            return getSlashCommandItems(editor, query, items);
          },
          command: ({ editor, range, props }) => {
            const item = props as SlashItem;
            insertSlashCommandItem(editor, range, item, builtInBlockRegistry, surfaceVariants);
          },
          render: () => {
            let component: ReactRenderer<SlashMenuHandle> | null = null;
            let popup: HTMLDivElement | null = null;
            let popupPositioner: OverlayFloatingPositioner | null = null;
            let popupReference: OverlayFloatingReference | null = null;
            let popupTarget: HTMLElement | null = null;
            let unsubscribePopupTarget: (() => void) | null = null;

            const updatePopupPlacement = (editor: Editor, target: HTMLElement | null) => {
              popupTarget = target;
              popupPositioner?.update({
                environment: resolveSlashCommandPopupEnvironment(editor, target),
                reference: popupReference,
              });
            };

            const destroyPopup = () => {
              unsubscribePopupTarget?.();
              unsubscribePopupTarget = null;
              popupPositioner?.destroy();
              popupPositioner = null;
              popup?.remove();
              popup = null;
              popupReference = null;
              popupTarget = null;
              component?.destroy();
              component = null;
            };

            return {
              onStart: (props) => {
                destroyPopup();
                if (props.editor.isDestroyed || !isSlashCommandActive(props.editor.state)) return;

                component = new ReactRenderer(SlashMenu, {
                  props,
                  editor: props.editor,
                });
                popup = props.editor.view.dom.ownerDocument.createElement("div");
                popup.style.zIndex = String(zIndex.dropdown);
                popup.appendChild(component.element);
                popupReference = slashCommandReference(props.editor, props.clientRect);
                popupTarget = resolveSlashCommandPopupTarget(props.editor);
                popupPositioner = createOverlayFloatingPositioner({
                  floatingElement: popup,
                  offset: 6,
                  placement: "bottom-start",
                });
                popupPositioner.start({
                  environment: resolveSlashCommandPopupEnvironment(props.editor, popupTarget),
                  reference: popupReference,
                });
                unsubscribePopupTarget = subscribeEditorFloatingLayerRoot(
                  props.editor,
                  AUTHORING_EDITOR_FLOATING_LAYER_KIND,
                  (target) => {
                    if (target === popupTarget) return;
                    updatePopupPlacement(props.editor, target);
                  },
                );
              },
              onUpdate: (props) => {
                if (props.editor.isDestroyed || !isSlashCommandActive(props.editor.state)) {
                  destroyPopup();
                  return;
                }

                component?.updateProps(props);
                popupReference = slashCommandReference(props.editor, props.clientRect);
                updatePopupPlacement(props.editor, resolveSlashCommandPopupTarget(props.editor));
              },
              onKeyDown: (props) => {
                if (props.event.key === "Escape") {
                  destroyPopup();
                  return true;
                }
                return component?.ref?.onKeyDown(props.event) ?? false;
              },
              onExit: destroyPopup,
            };
          },
        }),
      ];
    },
  });
}
