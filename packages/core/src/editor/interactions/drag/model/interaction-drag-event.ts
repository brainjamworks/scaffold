import type { ClientDelta, ClientPoint, LocalDelta } from "./coordinate-space";

export type DragInputProfile = "pointer" | "sortable-vertical" | "sortable-horizontal";
export type DragAccessibilityMode = "draggable" | "sortable" | "selection-alternative";
export type DragInputKind = "pointer" | "keyboard";
export type InteractionCollisionPolicy = "pointer" | "closest-center" | "feature-resolver";

export type DragCancellationReason =
  | "escape"
  | "owner-window-blur"
  | "source-removed"
  | "environment-lost"
  | "invalid-drop"
  | "unmount"
  | "dnd-kit";

export interface DragAccessibilityLabels {
  readonly draggable: string;
  readonly instructions?: string;
  readonly pickedUp?: string;
  readonly moved?: string;
  readonly dropped?: string;
  readonly cancelled?: string;
}

export interface InteractionDragEntity<Data> {
  readonly id: string;
  readonly data: Data;
  readonly sortable?: Readonly<{
    readonly index: number;
    readonly initialIndex: number;
  }>;
}

export interface InteractionDragEvent<ActiveData, OverData> {
  readonly input: DragInputKind;
  readonly active: Readonly<InteractionDragEntity<ActiveData>>;
  readonly over: Readonly<InteractionDragEntity<OverData>> | null;
  readonly clientPoint: ClientPoint | null;
  readonly clientDelta: ClientDelta | null;
  readonly localDelta: LocalDelta | null;
}
