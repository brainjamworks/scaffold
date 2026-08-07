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
import { readCourseSectionStartOptions } from "@/document/model/course-structure/course-section-start-options";

interface SurfaceTarget {
  id: string;
  node: ProseMirrorNode;
  pos: number;
}

export interface SurfaceTemplatePickerRequest {
  afterSurfaceId: string;
}

export interface CourseSectionStartRequest {
  atSurfaceId: string;
}

export interface AuthoringSlideDividersState {
  courseSectionStartRequest: CourseSectionStartRequest | null;
  templatePickerRequest: SurfaceTemplatePickerRequest | null;
}

type AuthoringSlideDividersMeta =
  | {
      type: "open-template-picker";
      afterSurfaceId: string;
    }
  | {
      type: "close-template-picker";
    }
  | {
      type: "open-course-section-start";
      atSurfaceId: string;
    }
  | {
      type: "close-course-section-start";
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
            courseSectionStartRequest: null,
            templatePickerRequest: null,
          }),
          apply(tr, value) {
            const meta = readAuthoringSlideDividersMeta(tr);
            if (!meta) return value;
            if (meta.type === "open-template-picker") {
              return {
                courseSectionStartRequest: null,
                templatePickerRequest: {
                  afterSurfaceId: meta.afterSurfaceId,
                },
              };
            }
            if (meta.type === "close-template-picker") {
              return { ...value, templatePickerRequest: null };
            }
            if (meta.type === "open-course-section-start") {
              return {
                courseSectionStartRequest: { atSurfaceId: meta.atSurfaceId },
                templatePickerRequest: null,
              };
            }
            return { ...value, courseSectionStartRequest: null };
          },
        },
        props: {
          decorations(state) {
            const widgets: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (node.type.name !== "courseDocument") return true;
              if (node.attrs["mode"] !== "slideshow") return false;

              const activeSurface = resolveActiveSurfaceTargetRef(state);
              const startSurfaceIds = new Set<string>(
                readCourseSectionStartOptions(state.doc).map((option) => option.atSurfaceId),
              );
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

              const firstSurface = surfaces[0];
              if (firstSurface && startSurfaceIds.has(firstSurface.id)) {
                widgets.push(
                  Decoration.widget(
                    firstSurface.pos,
                    (view) =>
                      createCourseSectionStartDividerElement({
                        slideNumber: 1,
                        surfaceId: firstSurface.id,
                        view,
                      }),
                    {
                      key: "authoring-course-section-start-" + firstSurface.id,
                      side: -1,
                    },
                  ),
                );
              }

              for (const [index, surface] of surfaces.entries()) {
                const followingSurface = surfaces[index + 1];
                widgets.push(
                  Decoration.widget(
                    surface.pos + surface.node.nodeSize,
                    (view) =>
                      createSlideDividerElement({
                        active:
                          activeSurface?.id === surface.id || activeSurface?.pos === surface.pos,
                        slideNumber: index + 1,
                        ...(followingSurface && startSurfaceIds.has(followingSurface.id)
                          ? { startAtSurfaceId: followingSurface.id }
                          : {}),
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
  startAtSurfaceId,
  surfaceId,
  view,
  active,
}: {
  active: boolean;
  slideNumber: number;
  startAtSurfaceId?: string;
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
  if (startAtSurfaceId) {
    divider.append(
      createCourseSectionStartButton({
        slideNumber: slideNumber + 1,
        surfaceId: startAtSurfaceId,
        view,
      }),
    );
  }
  divider.append(trailingRule);

  return divider;
}

function createCourseSectionStartDividerElement({
  slideNumber,
  surfaceId,
  view,
}: {
  slideNumber: number;
  surfaceId: string;
  view: EditorView;
}): HTMLElement {
  const divider = document.createElement("div");
  divider.setAttribute("contenteditable", "false");
  divider.setAttribute("data-course-section-start-divider", "");
  divider.className =
    "sc-authoring-slide-divider sc-authoring-slide-divider--course-section-leading";

  const rule = document.createElement("span");
  rule.className = "sc-authoring-slide-divider__rule";
  const trailingRule = rule.cloneNode() as HTMLSpanElement;
  divider.append(rule);
  divider.append(createCourseSectionStartButton({ slideNumber, surfaceId, view }));
  divider.append(trailingRule);
  return divider;
}

function createCourseSectionStartButton({
  slideNumber,
  surfaceId,
  view,
}: {
  slideNumber: number;
  surfaceId: string;
  view: EditorView;
}): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sc-authoring-slide-divider__course-section-button";
  button.setAttribute("aria-label", "Start Course Section at slide " + slideNumber);
  button.textContent = "Start Course Section";
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  button.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openCourseSectionStartDialog(view, surfaceId);
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    openCourseSectionStartDialog(view, surfaceId);
  });
  return button;
}

export function getAuthoringSlideDividersState(state: EditorState): AuthoringSlideDividersState {
  return (
    authoringSlideDividersPluginKey.getState(state) ?? {
      courseSectionStartRequest: null,
      templatePickerRequest: null,
    }
  );
}

export function closeCourseSectionStartDialog(view: EditorView): void {
  view.dispatch(
    view.state.tr.setMeta(authoringSlideDividersPluginKey, {
      type: "close-course-section-start",
    } satisfies AuthoringSlideDividersMeta),
  );
}

export function openCourseSectionStartDialog(view: EditorView, atSurfaceId: string): void {
  view.dispatch(
    view.state.tr.setMeta(authoringSlideDividersPluginKey, {
      type: "open-course-section-start",
      atSurfaceId,
    } satisfies AuthoringSlideDividersMeta),
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

  if (
    meta["type"] === "open-course-section-start" &&
    typeof meta["atSurfaceId"] === "string" &&
    meta["atSurfaceId"].length > 0
  ) {
    return {
      type: "open-course-section-start",
      atSurfaceId: meta["atSurfaceId"],
    };
  }

  if (meta["type"] === "close-course-section-start") {
    return { type: "close-course-section-start" };
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
