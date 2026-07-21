export const AUTHORING_FRAME_ATTR = "data-authoring-frame";
export const AUTHORING_FRAME_EDITABLE_ATTR = "data-authoring-frame-editable";
export const AUTHORING_CHROME_ACTIVE_ATTR = "data-authoring-chrome-active";
export const AUTHORING_ANCHOR_ATTR = "data-authoring-anchor";

export const AuthoringFrameKind = {
  Block: "block",
  Cell: "cell",
  Grid: "grid",
  Layout: "layout",
  Region: "region",
  Section: "section",
  Surface: "surface",
} as const;

export type AuthoringFrameKind = (typeof AuthoringFrameKind)[keyof typeof AuthoringFrameKind];

export interface AuthoringFrameDescriptor {
  definition: string | null;
  frameKind: AuthoringFrameKind;
  id: string;
  nodeType: string | null;
}

export interface AuthoringFrameLocator {
  frameKind: AuthoringFrameKind;
  id: string;
}

export interface CourseBlockAuthoringFrameInput {
  blockId: unknown;
  definition?: string;
  nodeType: string;
}

export interface StructuralAuthoringFrameInput {
  definition?: string;
  frameKind: Exclude<AuthoringFrameKind, typeof AuthoringFrameKind.Block>;
  id: unknown;
  nodeType: string;
}

export interface GridAuthoringFrameInput {
  gridId: unknown;
}

export interface CellAuthoringFrameInput {
  cellId: unknown;
}

export interface LayoutAuthoringFrameInput {
  layoutId: unknown;
}

export interface SectionAuthoringFrameInput {
  sectionId: unknown;
}

export interface SurfaceAuthoringFrameInput {
  definition?: string;
  surfaceId: unknown;
}

export function courseBlockAuthoringFrameAttributes({
  blockId,
  definition,
  nodeType,
}: CourseBlockAuthoringFrameInput): Record<string, string> {
  return authoringFrameAttributes({
    definition: definition ?? nodeType,
    frameKind: AuthoringFrameKind.Block,
    id: blockId,
    nodeType,
  });
}

export function gridAuthoringFrameAttributes({
  gridId,
}: GridAuthoringFrameInput): Record<string, string> {
  return structuralAuthoringFrameAttributes({
    frameKind: AuthoringFrameKind.Grid,
    id: gridId,
    nodeType: "grid",
  });
}

export function cellAuthoringFrameAttributes({
  cellId,
}: CellAuthoringFrameInput): Record<string, string> {
  return structuralAuthoringFrameAttributes({
    frameKind: AuthoringFrameKind.Cell,
    id: cellId,
    nodeType: "cell",
  });
}

export function layoutAuthoringFrameAttributes({
  layoutId,
}: LayoutAuthoringFrameInput): Record<string, string> {
  return structuralAuthoringFrameAttributes({
    frameKind: AuthoringFrameKind.Layout,
    id: layoutId,
    nodeType: "layout",
  });
}

export function sectionAuthoringFrameAttributes({
  sectionId,
}: SectionAuthoringFrameInput): Record<string, string> {
  return structuralAuthoringFrameAttributes({
    frameKind: AuthoringFrameKind.Section,
    id: sectionId,
    nodeType: "section",
  });
}

export function surfaceAuthoringFrameAttributes({
  definition,
  surfaceId,
}: SurfaceAuthoringFrameInput): Record<string, string> {
  return structuralAuthoringFrameAttributes({
    ...(definition ? { definition } : {}),
    frameKind: AuthoringFrameKind.Surface,
    id: surfaceId,
    nodeType: "surface",
  });
}

export function structuralAuthoringFrameAttributes({
  definition,
  frameKind,
  id,
  nodeType,
}: StructuralAuthoringFrameInput): Record<string, string> {
  return authoringFrameAttributes({
    definition: definition ?? nodeType,
    frameKind,
    id,
    nodeType,
  });
}

export function authoringFrameAttributes({
  definition,
  frameKind,
  id,
  nodeType,
}: {
  definition?: string;
  frameKind: AuthoringFrameKind;
  id: unknown;
  nodeType: string;
}): Record<string, string> {
  const stableId = readStableId(id);
  if (!stableId) return {};

  return {
    "data-definition": definition ?? nodeType,
    "data-id": stableId,
    "data-node": nodeType,
    [AUTHORING_FRAME_ATTR]: frameKind,
  };
}

export function authoringFrameSelector(locator: AuthoringFrameLocator): string {
  const id = readStableId(locator.id);
  if (!id) return "";
  return [
    `[${AUTHORING_FRAME_ATTR}="${escapeAttributeValue(locator.frameKind)}"]`,
    `[data-id="${escapeAttributeValue(id)}"]`,
  ].join("");
}

export function resolveAuthoringFrameElement(
  root: ParentNode | Element | null | undefined,
  locator: AuthoringFrameLocator | null | undefined,
): Element | null {
  if (!root || !locator) return null;
  const selector = authoringFrameSelector(locator);
  if (!selector) return null;
  if (root instanceof Element && root.matches(selector)) return root;
  return root.querySelector(selector);
}

export function closestAuthoringFrameElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest(`[${AUTHORING_FRAME_ATTR}]`);
}

export function readAuthoringFrameDescriptor(element: Element): AuthoringFrameDescriptor | null {
  const frameKind = element.getAttribute(AUTHORING_FRAME_ATTR);
  if (!isAuthoringFrameKind(frameKind)) return null;

  const id = readStableId(element.getAttribute("data-id"));
  if (!id) return null;

  return {
    definition: element.getAttribute("data-definition"),
    frameKind,
    id,
    nodeType: element.getAttribute("data-node"),
  };
}

export function authoringChromeActiveAttributes(
  active: boolean | null | undefined,
): Record<string, string> {
  return active ? { [AUTHORING_CHROME_ACTIVE_ATTR]: "" } : {};
}

export function isAuthoringFrameKind(value: string | null): value is AuthoringFrameKind {
  return (
    value === AuthoringFrameKind.Block ||
    value === AuthoringFrameKind.Cell ||
    value === AuthoringFrameKind.Grid ||
    value === AuthoringFrameKind.Layout ||
    value === AuthoringFrameKind.Region ||
    value === AuthoringFrameKind.Section ||
    value === AuthoringFrameKind.Surface
  );
}

function readStableId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function escapeAttributeValue(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}
