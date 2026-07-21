import { Extension, type Editor as TiptapEditor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type RuntimeSurfaceState = "current" | "previous" | "next" | "hidden";

export type RuntimeSurfaceStateMap = Readonly<Record<string, RuntimeSurfaceState>>;

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

            const hasCurrentSurface = surfaceTargets.some(
              (target) => surfaceStates[target.id] === "current",
            );
            if (!hasCurrentSurface) return null;

            return DecorationSet.create(
              state.doc,
              surfaceTargets.map((target) => {
                const surfaceState = surfaceStates[target.id] ?? "hidden";
                return Decoration.node(
                  target.pos,
                  target.pos + target.node.nodeSize,
                  runtimeSurfaceAttrs(surfaceState),
                );
              }),
            );
          },
        },
      }),
    ];
  },
});

function runtimeSurfaceAttrs(surfaceState: RuntimeSurfaceState): Record<string, string> {
  if (surfaceState === "current") {
    return {
      "data-runtime-surface-state": surfaceState,
      "data-runtime-surface-visible": "true",
    };
  }

  return {
    "aria-hidden": "true",
    "data-runtime-surface-hidden": "true",
    "data-runtime-surface-state": surfaceState,
    hidden: "",
  };
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
