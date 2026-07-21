import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import type { BlockFrameDefinition, BlockFrameResizeMode } from "@/editor/blocks/block-definition";
import type { HorizontalAlignment } from "@/schemas/course-document";

export type BlockFrameWidthMode = "fill" | "percent";
export type BlockFrameAlign = "start" | "center" | "end";

export interface BlockFrameAttrs {
  align: BlockFrameAlign;
  aspectRatio: number | null;
  heightPx: number | null;
  widthMode: BlockFrameWidthMode;
  widthPercent: number;
}

export interface BlockFrameRegion {
  parentWidthPx: number;
}

export interface ResizeBlockFrameInput extends BlockFrameRegion {
  aspectRatio?: number | null;
  definition?: BlockFrameDefinitionStyle;
  desiredHeightPx?: number;
  desiredWidthPx: number;
  preserveAspectRatio?: boolean;
}

export interface BlockFrameSize {
  heightPx?: number;
  widthPx: number;
}

export interface BlockFrameViewStyle {
  resizeMode: BlockFrameResizeMode;
  rootStyle: Record<string, string>;
}

export interface BlockFrameViewStyleOptions {
  heightPx?: number | null;
  widthPx?: number | null;
}

type BlockFrameDefinitionStyle = Partial<
  Pick<BlockFrameDefinition, "aspectRatio" | "preserveAspectRatio" | "resizeMode">
>;

export interface ResizeBlockFrameResult {
  attrs: BlockFrameAttrs;
  size: BlockFrameSize;
}

const DEFAULT_FRAME: BlockFrameAttrs = {
  align: "start",
  aspectRatio: null,
  heightPx: null,
  widthMode: "fill",
  widthPercent: 100,
};

export const MIN_BLOCK_FRAME_WIDTH_PERCENT = 10;

export function normalizeBlockFrame(value: unknown): BlockFrameAttrs {
  const input = isRecord(value) ? value : {};
  const widthMode = input["widthMode"] === "percent" ? "percent" : "fill";
  const widthPercent =
    widthMode === "fill"
      ? 100
      : clampPercent(input["widthPercent"], MIN_BLOCK_FRAME_WIDTH_PERCENT, 100);
  const align = parseAlign(input["align"]);
  const aspectRatio = parseAspectRatio(input["aspectRatio"]);
  const heightPx = parseHeightPx(input["heightPx"]);

  return {
    align,
    aspectRatio,
    heightPx,
    widthMode,
    widthPercent,
  };
}

export function resolveBlockFrameSize(frame: unknown, region: BlockFrameRegion): BlockFrameSize {
  const normalized = normalizeBlockFrame(frame);
  const parentWidthPx = normalizeParentWidth(region.parentWidthPx);
  const widthPx =
    normalized.widthMode === "fill"
      ? parentWidthPx
      : roundSize(parentWidthPx * (normalized.widthPercent / 100));

  if (normalized.heightPx) {
    return { heightPx: normalized.heightPx, widthPx };
  }

  if (!normalized.aspectRatio) {
    return { widthPx };
  }

  return {
    heightPx: roundSize(widthPx / normalized.aspectRatio),
    widthPx,
  };
}

export function resizeBlockFrame(
  frame: unknown,
  input: ResizeBlockFrameInput,
): ResizeBlockFrameResult {
  const normalized = normalizeBlockFrame(frame);
  const parentWidthPx = normalizeParentWidth(input.parentWidthPx);
  const desiredWidthPx = Number.isFinite(input.desiredWidthPx)
    ? input.desiredWidthPx
    : parentWidthPx;
  const widthPercent = roundPercent(
    Math.min(100, Math.max(MIN_BLOCK_FRAME_WIDTH_PERCENT, (desiredWidthPx / parentWidthPx) * 100)),
  );
  const aspectRatio = input.preserveAspectRatio
    ? (normalized.aspectRatio ??
      resolveDeclaredBlockFrameAspectRatio(input.definition) ??
      parseAspectRatio(input.aspectRatio))
    : null;
  const attrs: BlockFrameAttrs = {
    ...normalized,
    aspectRatio,
    heightPx: resolveResizedHeightPx(normalized, input),
    widthMode: "percent",
    widthPercent,
  };

  return {
    attrs,
    size: resolveBlockFrameSize(attrs, { parentWidthPx }),
  };
}

export function resolveDeclaredBlockFrameAspectRatio(
  definition?: Pick<BlockFrameDefinition, "aspectRatio">,
): number | null {
  return typeof definition?.aspectRatio === "number" &&
    Number.isFinite(definition.aspectRatio) &&
    definition.aspectRatio > 0
    ? definition.aspectRatio
    : null;
}

export function setBlockFrameAt(editor: Editor, pos: number, frame: unknown): boolean {
  const tr = setBlockFrameInTransaction(editor.state.tr, pos, frame);
  if (!tr) return false;

  editor.view.dispatch(tr);
  return true;
}

export function setBlockFrameHorizontalAlignmentInTransaction(
  tr: Transaction,
  pos: number,
  value: HorizontalAlignment,
): Transaction | null {
  const align = horizontalAlignmentToBlockFrameAlign(value);
  if (!align) return null;

  const node = nodeWithFrameAt(tr, pos);
  if (!node) return null;

  return setBlockFrameInTransaction(tr, pos, {
    ...normalizeBlockFrame(node.attrs["frame"]),
    align,
  });
}

export function blockFrameStyle(frame: unknown): string {
  const { rootStyle } = resolveBlockFrameViewStyle(frame);

  return Object.entries(rootStyle)
    .map(([property, value]) => `${toKebabCase(property)}: ${value}`)
    .join("; ");
}

export function resolveBlockFrameViewStyle(
  frame: unknown,
  definition?: BlockFrameDefinitionStyle,
  options: BlockFrameViewStyleOptions = {},
): BlockFrameViewStyle {
  const normalized = normalizeBlockFrame(frame);
  const resizeMode = definition?.resizeMode ?? "responsive";
  const width =
    typeof options.widthPx === "number" && Number.isFinite(options.widthPx) && options.widthPx > 0
      ? `${roundSize(options.widthPx)}px`
      : normalized.widthMode === "fill"
        ? "100%"
        : `${normalized.widthPercent}%`;
  const rootStyle: Record<string, string> = {
    width,
    maxWidth: "100%",
    minWidth: "0",
    ...marginStyle(normalized.align),
  };
  const declaredAspectRatio = resolveDeclaredBlockFrameAspectRatio(definition);
  const aspectRatio = declaredAspectRatio ?? normalized.aspectRatio;

  if (definition?.preserveAspectRatio && aspectRatio) {
    rootStyle.aspectRatio = String(aspectRatio);
  }

  if (resizeMode === "freeform") {
    const heightPx =
      typeof options.heightPx === "number" &&
      Number.isFinite(options.heightPx) &&
      options.heightPx > 0
        ? options.heightPx
        : normalized.heightPx;
    if (heightPx) {
      rootStyle.height = `${roundSize(heightPx)}px`;
    }
  }

  return {
    resizeMode,
    rootStyle,
  };
}

export function applyBlockFrameStyle(
  element: Element,
  frame: unknown,
  definition?: BlockFrameDefinitionStyle,
  options: BlockFrameViewStyleOptions = {},
): void {
  if (!(element instanceof HTMLElement)) return;

  const { rootStyle } = resolveBlockFrameViewStyle(frame, definition, options);
  applyStyle(element, rootStyle, [
    "aspectRatio",
    "height",
    "maxWidth",
    "minWidth",
    "marginLeft",
    "marginRight",
    "width",
  ]);
}

function parseAlign(value: unknown): BlockFrameAlign {
  return value === "start" || value === "end" || value === "center" ? value : DEFAULT_FRAME.align;
}

function parseAspectRatio(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_FRAME.aspectRatio;
}

function parseHeightPx(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? roundSize(value)
    : DEFAULT_FRAME.heightPx;
}

function resolveResizedHeightPx(
  frame: BlockFrameAttrs,
  input: ResizeBlockFrameInput,
): number | null {
  if (input.definition?.resizeMode !== "freeform") return frame.heightPx;
  return parseHeightPx(input.desiredHeightPx);
}

function clampPercent(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return max;
  return roundPercent(Math.min(max, Math.max(min, value)));
}

function normalizeParentWidth(widthPx: number): number {
  return Number.isFinite(widthPx) && widthPx > 0 ? widthPx : 1;
}

function roundPercent(value: number): number {
  return Number(value.toFixed(4));
}

function roundSize(value: number): number {
  return Number(value.toFixed(2));
}

function sameFrame(left: BlockFrameAttrs, right: BlockFrameAttrs): boolean {
  return (
    left.align === right.align &&
    left.aspectRatio === right.aspectRatio &&
    left.heightPx === right.heightPx &&
    left.widthMode === right.widthMode &&
    left.widthPercent === right.widthPercent
  );
}

function setBlockFrameInTransaction(
  tr: Transaction,
  pos: number,
  frame: unknown,
): Transaction | null {
  const node = nodeWithFrameAt(tr, pos);
  if (!node) return null;

  const nextFrame = normalizeBlockFrame(frame);
  const currentFrame = normalizeBlockFrame(node.attrs["frame"]);
  if (sameFrame(currentFrame, nextFrame)) return null;

  try {
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      frame: nextFrame,
    });
    return tr;
  } catch {
    return null;
  }
}

function nodeWithFrameAt(tr: Transaction, pos: number) {
  if (!Number.isInteger(pos) || pos < 0 || pos > tr.doc.content.size) return null;
  const node = tr.doc.nodeAt(pos);
  return node?.type.spec.attrs?.["frame"] ? node : null;
}

function horizontalAlignmentToBlockFrameAlign(value: HorizontalAlignment): BlockFrameAlign | null {
  if (value === "left") return "start";
  if (value === "center") return "center";
  if (value === "right") return "end";
  return null;
}

function marginStyle(align: BlockFrameAlign): Record<string, string> {
  if (align === "start") return { marginLeft: "0", marginRight: "auto" };
  if (align === "end") return { marginLeft: "auto", marginRight: "0" };
  return { marginLeft: "auto", marginRight: "auto" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function applyStyle(
  element: HTMLElement,
  style: Record<string, string>,
  properties: string[],
): void {
  for (const property of properties) {
    element.style.setProperty(toKebabCase(property), style[property] ?? "");
  }
}

function toKebabCase(property: string): string {
  return property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
