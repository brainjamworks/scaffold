import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";

interface SurfaceTarget {
  id: string;
  node: ProseMirrorNode;
  pos: number;
}

export interface SurfaceTemplatePickerRequest {
  afterSurfaceId: string;
}

export interface AuthoringSlideDividersState {
  templatePickerRequest: SurfaceTemplatePickerRequest | null;
}

type AuthoringSlideDividersMeta =
  | {
      type: "open-template-picker";
      afterSurfaceId: string;
    }
  | {
      type: "close-template-picker";
    };

export const authoringSlideDividersPluginKey = new PluginKey<AuthoringSlideDividersState>(
  "authoringSlideDividers",
);

export const AuthoringSlideDividers = Extension.create({
  name: "authoringSlideDividers",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: authoringSlideDividersPluginKey,
        state: {
          init: (): AuthoringSlideDividersState => ({
            templatePickerRequest: null,
          }),
          apply(tr, value) {
            const meta = readAuthoringSlideDividersMeta(tr);
            if (!meta) return value;
            if (meta.type === "open-template-picker") {
              return {
                templatePickerRequest: {
                  afterSurfaceId: meta.afterSurfaceId,
                },
              };
            }
            return { templatePickerRequest: null };
          },
        },
        props: {
          decorations(state) {
            const widgets: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (node.type.name !== "courseDocument") return true;
              if (node.attrs["mode"] !== "slideshow") return false;

              const activeSurface = resolveActiveSurfaceTargetRef(state);
              const surfaces: SurfaceTarget[] = [];
              node.forEach((child, offset) => {
                if (child.type.name !== "surface") return;

                const surfaceId = child.attrs["id"];
                if (typeof surfaceId !== "string" || surfaceId.length === 0) {
                  return;
                }

                surfaces.push({
                  id: surfaceId,
                  node: child,
                  pos: pos + 1 + offset,
                });
              });

              for (const [index, surface] of surfaces.entries()) {
                widgets.push(
                  Decoration.widget(
                    surface.pos + surface.node.nodeSize,
                    (view) =>
                      createSlideDividerElement({
                        active:
                          activeSurface?.id === surface.id || activeSurface?.pos === surface.pos,
                        slideNumber: index + 1,
                        surfaceId: surface.id,
                        view,
                      }),
                    {
                      key: `authoring-slide-divider-${surface.id}`,
                      side: 1,
                    },
                  ),
                );
              }

              return false;
            });

            if (widgets.length === 0) return null;

            return DecorationSet.create(state.doc, widgets);
          },
        },
      }),
    ];
  },
});

function createSlideDividerElement({
  slideNumber,
  surfaceId,
  view,
  active,
}: {
  active: boolean;
  slideNumber: number;
  surfaceId: string;
  view: EditorView;
}): HTMLElement {
  const divider = document.createElement("div");
  divider.setAttribute("contenteditable", "false");
  divider.setAttribute("data-after-surface-id", surfaceId);
  divider.setAttribute("data-authoring-slide-divider", "");
  divider.setAttribute("data-testid", "authoring-slide-divider");
  if (active) {
    divider.setAttribute("data-active", "true");
  }
  divider.className = "sc-authoring-slide-divider";

  const rule = document.createElement("span");
  rule.className = "sc-authoring-slide-divider__rule";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "sc-authoring-slide-divider__button";
  button.setAttribute("aria-label", `Add slide after slide ${slideNumber}`);
  button.title = "Add slide";
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    openSurfaceTemplatePickerAfterSurface(view, surfaceId);
  });

  const trailingRule = document.createElement("span");
  trailingRule.className = "sc-authoring-slide-divider__rule";

  divider.append(rule);
  divider.append(button);
  divider.append(trailingRule);

  return divider;
}

export function getAuthoringSlideDividersState(state: EditorState): AuthoringSlideDividersState {
  return (
    authoringSlideDividersPluginKey.getState(state) ?? {
      templatePickerRequest: null,
    }
  );
}

export function closeSurfaceTemplatePicker(view: EditorView): void {
  view.dispatch(
    view.state.tr.setMeta(authoringSlideDividersPluginKey, {
      type: "close-template-picker",
    } satisfies AuthoringSlideDividersMeta),
  );
}

function openSurfaceTemplatePickerAfterSurface(view: EditorView, afterSurfaceId: string): void {
  view.dispatch(
    view.state.tr.setMeta(authoringSlideDividersPluginKey, {
      type: "open-template-picker",
      afterSurfaceId,
    } satisfies AuthoringSlideDividersMeta),
  );
}

function resolveActiveSurfaceTargetRef(state: EditorState): InteractionTargetRef | null {
  const owners = publishInteractionOwnerSnapshot(state, null, {
    blockDefinitions: builtInBlockRegistry,
  }).owners;
  const explicitRef = owners.menuOwner.target ?? owners.explicitOwner.target;
  if (explicitRef?.kind === InteractionTargetKind.Surface) return explicitRef;

  return owners.contextOwners.surface;
}

function readAuthoringSlideDividersMeta(tr: Transaction): AuthoringSlideDividersMeta | null {
  const meta = tr.getMeta(authoringSlideDividersPluginKey);
  if (!isRecord(meta)) return null;

  if (
    meta["type"] === "open-template-picker" &&
    typeof meta["afterSurfaceId"] === "string" &&
    meta["afterSurfaceId"].length > 0
  ) {
    return {
      type: "open-template-picker",
      afterSurfaceId: meta["afterSurfaceId"],
    };
  }

  if (meta["type"] === "close-template-picker") {
    return { type: "close-template-picker" };
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
