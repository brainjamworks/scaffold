export type CoordinateSpaceKind = "viewport" | "scaled-canvas";

export type ClientPoint = Readonly<{ space: "client"; x: number; y: number }>;
export type LocalPoint = Readonly<{ space: "local"; x: number; y: number }>;
export type ClientDelta = Readonly<{ space: "client-delta"; x: number; y: number }>;
export type LocalDelta = Readonly<{ space: "local-delta"; x: number; y: number }>;
export type ClientRectSnapshot = Readonly<{
  space: "client";
  left: number;
  top: number;
  width: number;
  height: number;
}>;
export type LocalSize = Readonly<{
  space: "local";
  width: number;
  height: number;
}>;

export type CoordinateInvalidationReason =
  | "scroll"
  | "resize"
  | "fullscreen"
  | "root-replaced"
  | "transform";

export interface CoordinateSpaceSnapshot {
  readonly kind: CoordinateSpaceKind;
  readonly revision: number;
  readonly clientRect: ClientRectSnapshot;
  readonly localSize: LocalSize;
  readonly scaleX: number;
  readonly scaleY: number;
  clientPointToLocal(point: ClientPoint): LocalPoint;
  localPointToClient(point: LocalPoint): ClientPoint;
  clientDeltaToLocal(delta: ClientDelta): LocalDelta;
  localDeltaToClient(delta: LocalDelta): ClientDelta;
}

export interface InteractionCoordinateSpace {
  readonly kind: CoordinateSpaceKind;
  measure(): CoordinateSpaceSnapshot | null;
  subscribe(listener: (reason: CoordinateInvalidationReason) => void): () => void;
}

export interface CoordinateSpaceSnapshotInput {
  readonly kind: CoordinateSpaceKind;
  readonly revision: number;
  readonly clientRect: Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  readonly localSize: Readonly<{ width: number; height: number }>;
}

export function createClientPoint(x: number, y: number): ClientPoint | null {
  return createTaggedVector("client", x, y);
}

export function createLocalPoint(x: number, y: number): LocalPoint | null {
  return createTaggedVector("local", x, y);
}

export function createClientDelta(x: number, y: number): ClientDelta | null {
  return createTaggedVector("client-delta", x, y);
}

export function createLocalDelta(x: number, y: number): LocalDelta | null {
  return createTaggedVector("local-delta", x, y);
}

export function createClientRectSnapshot(
  left: number,
  top: number,
  width: number,
  height: number,
): ClientRectSnapshot | null {
  if (!areFinite(left, top) || !arePositiveFinite(width, height)) return null;
  return Object.freeze({ space: "client", left, top, width, height });
}

export function createLocalSize(width: number, height: number): LocalSize | null {
  if (!arePositiveFinite(width, height)) return null;
  return Object.freeze({ space: "local", width, height });
}

export function createCoordinateSpaceSnapshot(
  input: CoordinateSpaceSnapshotInput,
): CoordinateSpaceSnapshot | null {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) return null;

  const clientRect = createClientRectSnapshot(
    input.clientRect.left,
    input.clientRect.top,
    input.clientRect.width,
    input.clientRect.height,
  );
  const localSize = createLocalSize(input.localSize.width, input.localSize.height);
  if (!clientRect || !localSize) return null;

  const scaleX = clientRect.width / localSize.width;
  const scaleY = clientRect.height / localSize.height;
  if (!arePositiveFinite(scaleX, scaleY)) return null;

  return Object.freeze({
    kind: input.kind,
    revision: input.revision,
    clientRect,
    localSize,
    scaleX,
    scaleY,
    clientPointToLocal: (point: ClientPoint) =>
      Object.freeze({
        space: "local" as const,
        x: (point.x - clientRect.left) / scaleX,
        y: (point.y - clientRect.top) / scaleY,
      }),
    localPointToClient: (point: LocalPoint) =>
      Object.freeze({
        space: "client" as const,
        x: point.x * scaleX + clientRect.left,
        y: point.y * scaleY + clientRect.top,
      }),
    clientDeltaToLocal: (delta: ClientDelta) =>
      Object.freeze({
        space: "local-delta" as const,
        x: delta.x / scaleX,
        y: delta.y / scaleY,
      }),
    localDeltaToClient: (delta: LocalDelta) =>
      Object.freeze({
        space: "client-delta" as const,
        x: delta.x * scaleX,
        y: delta.y * scaleY,
      }),
  });
}

function createTaggedVector<
  Space extends
    | ClientPoint["space"]
    | LocalPoint["space"]
    | ClientDelta["space"]
    | LocalDelta["space"],
>(space: Space, x: number, y: number): Readonly<{ space: Space; x: number; y: number }> | null {
  if (!areFinite(x, y)) return null;
  return Object.freeze({ space, x, y });
}

function areFinite(...values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}

function arePositiveFinite(...values: readonly number[]): boolean {
  return values.every((value) => Number.isFinite(value) && value > 0);
}
