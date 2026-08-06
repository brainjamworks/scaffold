export interface AxisAlignedTransformChainOptions {
  readonly allowScale: boolean;
}

export function hasSupportedAxisAlignedTransformChain(
  element: Element,
  ownerWindow: Window,
  { allowScale }: AxisAlignedTransformChainOptions,
): boolean {
  let current: Element | null = element;
  while (current) {
    const style = ownerWindow.getComputedStyle(current);
    const perspective = style.perspective?.trim() ?? "";
    if (perspective !== "" && perspective !== "none") return false;

    const transform = style.transform?.trim() ?? "";
    if (transform !== "" && transform !== "none") {
      const scale = readAxisAlignedScale(transform);
      if (!scale || (!allowScale && (!approximatelyOne(scale.x) || !approximatelyOne(scale.y)))) {
        return false;
      }
    }
    current = current.parentElement;
  }
  return true;
}

function readAxisAlignedScale(transform: string): Readonly<{ x: number; y: number }> | null {
  if (!transform.startsWith("matrix(") || !transform.endsWith(")")) return null;
  const values = transform
    .slice("matrix(".length, -1)
    .split(",")
    .map((value) => Number(value.trim()));
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) return null;
  const [scaleX, skewY, skewX, scaleY] = values as [number, number, number, number];
  if (scaleX <= 0 || scaleY <= 0 || Math.abs(skewX) > 1e-8 || Math.abs(skewY) > 1e-8) {
    return null;
  }
  return { x: scaleX, y: scaleY };
}

function approximatelyOne(value: number): boolean {
  return Math.abs(value - 1) <= 1e-8;
}
