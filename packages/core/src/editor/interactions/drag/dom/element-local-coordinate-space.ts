import {
  createClientPoint,
  createLocalPoint,
  type ClientPoint,
  type LocalPoint,
} from "../model/coordinate-space";

export interface ElementLocalCoordinateSpaceSnapshot {
  readonly kind: "html-border-box" | "svg-ctm";
  readonly scaleX: number;
  readonly scaleY: number;
  clientPointToLocal(point: ClientPoint): LocalPoint;
  localPointToClient(point: LocalPoint): ClientPoint;
}

interface AxisAlignedMatrix {
  readonly a: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export function measureElementLocalCoordinateSpace(
  element: Element,
): ElementLocalCoordinateSpaceSnapshot | null {
  const ownerDocument = element.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow || !element.isConnected) return null;

  const svgMatrix = screenCtm(element);
  if (svgMatrix !== undefined) {
    return svgMatrix ? createSnapshot("svg-ctm", svgMatrix) : null;
  }

  const OwnerHTMLElement = (ownerWindow as Window & typeof globalThis).HTMLElement;
  if (!(element instanceof OwnerHTMLElement) || !hasSupportedHtmlTransforms(element, ownerWindow)) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  const localWidth = element.offsetWidth;
  const localHeight = element.offsetHeight;
  if (
    !areFinite(rect.left, rect.top, rect.width, rect.height, localWidth, localHeight) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    localWidth <= 0 ||
    localHeight <= 0
  ) {
    return null;
  }
  const scaleX = rect.width / localWidth;
  const scaleY = rect.height / localHeight;
  if (!arePositiveFinite(scaleX, scaleY)) return null;
  return createSnapshot("html-border-box", {
    a: scaleX,
    d: scaleY,
    e: rect.left,
    f: rect.top,
  });
}

function screenCtm(element: Element): AxisAlignedMatrix | null | undefined {
  const candidate = element as Element & { getScreenCTM?: () => DOMMatrix | null };
  if (typeof candidate.getScreenCTM !== "function") return undefined;
  const matrix = candidate.getScreenCTM();
  if (!matrix) return null;
  const values = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
  if (!areFinite(...values)) return null;
  if (
    matrix.a <= 0 ||
    matrix.d <= 0 ||
    Math.abs(matrix.b) > 1e-8 ||
    Math.abs(matrix.c) > 1e-8 ||
    Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) <= 1e-12
  ) {
    return null;
  }
  return { a: matrix.a, d: matrix.d, e: matrix.e, f: matrix.f };
}

function createSnapshot(
  kind: ElementLocalCoordinateSpaceSnapshot["kind"],
  matrix: AxisAlignedMatrix,
): ElementLocalCoordinateSpaceSnapshot {
  return Object.freeze({
    kind,
    scaleX: matrix.a,
    scaleY: matrix.d,
    clientPointToLocal(point: ClientPoint) {
      return createLocalPoint((point.x - matrix.e) / matrix.a, (point.y - matrix.f) / matrix.d)!;
    },
    localPointToClient(point: LocalPoint) {
      return createClientPoint(point.x * matrix.a + matrix.e, point.y * matrix.d + matrix.f)!;
    },
  });
}

function hasSupportedHtmlTransforms(element: HTMLElement, ownerWindow: Window): boolean {
  let current: Element | null = element;
  while (current) {
    const transform = ownerWindow.getComputedStyle(current).transform?.trim() ?? "";
    if (transform !== "" && transform !== "none" && !isAxisAlignedTransform(transform)) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function isAxisAlignedTransform(transform: string): boolean {
  if (!transform.startsWith("matrix(") || !transform.endsWith(")")) return false;
  const values = transform
    .slice("matrix(".length, -1)
    .split(",")
    .map((value) => Number(value.trim()));
  if (values.length !== 6 || !areFinite(...values)) return false;
  const [scaleX, skewY, skewX, scaleY] = values as [number, number, number, number];
  return scaleX > 0 && scaleY > 0 && Math.abs(skewX) <= 1e-8 && Math.abs(skewY) <= 1e-8;
}

function areFinite(...values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}

function arePositiveFinite(...values: readonly number[]): boolean {
  return values.every((value) => Number.isFinite(value) && value > 0);
}
