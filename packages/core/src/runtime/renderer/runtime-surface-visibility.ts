import { Extension, type Editor as TiptapEditor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * `current` paints and owns the semantic/control runtime. `outgoing` and `incoming` are the two
 * inert paint layers of one whole-Surface transition; `incoming` is the runtime authority while it
 * paints, `outgoing` is frozen content. `previous`, `next` and `hidden` neither paint nor own.
 */
export type RuntimeSurfaceState =
  | "current"
  | "outgoing"
  | "incoming"
  | "previous"
  | "next"
  | "hidden";

export type RuntimeSurfaceStateMap = Readonly<Record<string, RuntimeSurfaceState>>;

export interface RuntimeSurfaceStateDescription {
  /** Whether the Surface DOM is painted at all. */
  readonly paints: boolean;
  /** Whether the Surface owns the active semantic/control runtime. */
  readonly authority: boolean;
  /** Whether the Surface DOM is inert and excluded from accessibility navigation. */
  readonly inert: boolean;
}

export function describeRuntimeSurfaceState(
  surfaceState: RuntimeSurfaceState,
): RuntimeSurfaceStateDescription {
  switch (surfaceState) {
    case "current":
      return CURRENT_DESCRIPTION;
    case "incoming":
      return INCOMING_DESCRIPTION;
    case "outgoing":
      return OUTGOING_DESCRIPTION;
    case "previous":
    case "next":
    case "hidden":
      return HIDDEN_DESCRIPTION;
  }
}

const CURRENT_DESCRIPTION = Object.freeze({ paints: true, authority: true, inert: false });
const INCOMING_DESCRIPTION = Object.freeze({ paints: true, authority: true, inert: true });
const OUTGOING_DESCRIPTION = Object.freeze({ paints: true, authority: false, inert: true });
const HIDDEN_DESCRIPTION = Object.freeze({ paints: false, authority: false, inert: true });

export function assertSingleRuntimeSurfaceAuthority(surfaceStates: RuntimeSurfaceStateMap): void {
  const authorities = Object.entries(surfaceStates).filter(
    ([, surfaceState]) => describeRuntimeSurfaceState(surfaceState).authority,
  );
  if (authorities.length > 1) {
    throw new Error(
      `Runtime Surface visibility granted authority to ${authorities.length} Surfaces: ${authorities
        .map(([surfaceId]) => surfaceId)
        .join(", ")}.`,
    );
  }
  const outgoing = Object.values(surfaceStates).filter((state) => state === "outgoing").length;
  const incoming = Object.values(surfaceStates).filter((state) => state === "incoming").length;
  if (outgoing > 1 || incoming > 1 || outgoing !== incoming) {
    throw new Error(
      `Runtime Surface visibility must pair exactly one outgoing with one incoming Surface (received ${outgoing} outgoing, ${incoming} incoming).`,
    );
  }
}

interface RuntimeSurfaceVisibilityState {
  surfaceStates: RuntimeSurfaceStateMap | null;
}

interface RuntimeSurfaceVisibilityMeta {
  type: "setSurfaceStates";
  surfaceStates: RuntimeSurfaceStateMap | null;
}

interface SurfaceDecorationTarget {
  id: string;
  node: ProseMirrorNode;
  pos: number;
}

const runtimeSurfaceVisibilityPluginKey = new PluginKey<RuntimeSurfaceVisibilityState>(
  "runtimeSurfaceVisibility",
);

export function setRuntimeVisibleSurfaceId(
  editor: TiptapEditor,
  visibleSurfaceId: string | null | undefined,
): void {
  const normalizedVisibleSurfaceId = visibleSurfaceId ?? null;

  setRuntimeSurfaceStates(
    editor,
    normalizedVisibleSurfaceId ? { [normalizedVisibleSurfaceId]: "current" } : null,
  );
}

export function setRuntimeSurfaceStates(
  editor: TiptapEditor,
  surfaceStates: RuntimeSurfaceStateMap | null | undefined,
): void {
  const normalizedSurfaceStates = surfaceStates ?? null;
  if (normalizedSurfaceStates) assertSingleRuntimeSurfaceAuthority(normalizedSurfaceStates);
  const currentSurfaceStates =
    runtimeSurfaceVisibilityPluginKey.getState(editor.state)?.surfaceStates ?? null;

  if (surfaceStatesEqual(currentSurfaceStates, normalizedSurfaceStates)) return;

  editor.view.dispatch(
    editor.state.tr.setMeta(runtimeSurfaceVisibilityPluginKey, {
      type: "setSurfaceStates",
      surfaceStates: normalizedSurfaceStates,
    } satisfies RuntimeSurfaceVisibilityMeta),
  );
}

export const RuntimeSurfaceVisibility = Extension.create({
  name: "runtimeSurfaceVisibility",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: runtimeSurfaceVisibilityPluginKey,
        state: {
          init: (): RuntimeSurfaceVisibilityState => ({ surfaceStates: null }),
          apply(tr, value) {
            const meta = tr.getMeta(runtimeSurfaceVisibilityPluginKey) as
              | RuntimeSurfaceVisibilityMeta
              | undefined;

            if (meta?.type === "setSurfaceStates") {
              return { surfaceStates: meta.surfaceStates };
            }

            return value;
          },
        },
        props: {
          decorations(state) {
            const surfaceStates =
              runtimeSurfaceVisibilityPluginKey.getState(state)?.surfaceStates ?? null;

            if (!surfaceStates) return null;

            const surfaceTargets: SurfaceDecorationTarget[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "surface") return true;

              const surfaceId = node.attrs.id;
              if (typeof surfaceId !== "string") return false;

              surfaceTargets.push({ id: surfaceId, node, pos });
              return false;
            });

            const hasAuthority = surfaceTargets.some(
              (target) => describeRuntimeSurfaceState(surfaceStates[target.id] ?? "hidden").authority,
            );
            if (!hasAuthority) return null;

            return DecorationSet.create(
              state.doc,
              surfaceTargets.map((target) => {
                const surfaceState = surfaceStates[target.id] ?? "hidden";
                return Decoration.node(
                  target.pos,
                  target.pos + target.node.nodeSize,
                  getRuntimeSurfaceAttributes(surfaceState),
                );
              }),
            );
          },
        },
      }),
    ];
  },
});

export function getRuntimeSurfaceAttributes(
  surfaceState: RuntimeSurfaceState,
): Readonly<Record<string, string>> {
  const description = describeRuntimeSurfaceState(surfaceState);
  if (!description.paints) {
    return Object.freeze({
      "aria-hidden": "true",
      "data-runtime-surface-hidden": "true",
      "data-runtime-surface-state": surfaceState,
      hidden: "",
    });
  }
  if (!description.inert) {
    return Object.freeze({
      "data-runtime-surface-state": surfaceState,
      "data-runtime-surface-visible": "true",
    });
  }
  return Object.freeze({
    "aria-hidden": "true",
    "data-runtime-surface-state": surfaceState,
    "data-runtime-surface-transition-layer": surfaceState,
    "data-runtime-surface-visible": "true",
    inert: "",
  });
}

function surfaceStatesEqual(
  left: RuntimeSurfaceStateMap | null,
  right: RuntimeSurfaceStateMap | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;

  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) return false;

  return leftEntries.every(([surfaceId, surfaceState]) => right[surfaceId] === surfaceState);
}
