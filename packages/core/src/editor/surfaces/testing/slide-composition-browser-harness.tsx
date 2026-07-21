import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import * as Y from "yjs";

import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor";
import { initializeAuthoringCourseDocumentFragment } from "@/document/authoring/initialize-authoring-document";
import { isRegisteredSlideCompositionSurfaceDefinition } from "@/editor/surfaces/model/slide-composition-definition";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { CourseDocumentRuntimeRenderer } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import "@/runtime/players/slideshow/SlideshowPlayer.css";

import type { CompositionStateCase } from "./slide-composition-cases";
import {
  COMPOSITION_GEOMETRY_ORACLE,
  type CompositionGeometryRelationship,
  type CompositionParticipantKey,
} from "./slide-composition-geometry-oracle";

const INTRINSIC_WIDTH = 1024;
const INTRINSIC_HEIGHT = 576;
const RECT_TOLERANCE = 0.5;

export interface IntrinsicRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CompositionGeometrySample {
  readonly state: CompositionStateCase;
  readonly renderer: "authoring" | "runtime";
  readonly surface: IntrinsicRect;
  readonly participants: Readonly<Partial<Record<CompositionParticipantKey, IntrinsicRect>>>;
  readonly rawParticipants: Readonly<
    Partial<Record<CompositionParticipantKey, RawCompositionParticipant>>
  >;
}

export interface RawCompositionParticipant {
  readonly rect: IntrinsicRect;
  readonly display: string;
  readonly visibility: string;
  readonly hasLayoutBox: boolean;
}

export interface MountedCompositionRenderer {
  readonly renderer: "authoring" | "runtime";
  readonly host: HTMLElement;
  readonly editor: TiptapEditor;
}

export interface RenderedCompositionStateCase {
  readonly host: HTMLElement;
  readonly authoring: MountedCompositionRenderer;
  readonly runtime: MountedCompositionRenderer;
  readonly dispose: () => void;
  readonly isDisposed: () => boolean;
}

export interface RenderCompositionStateCaseOptions {
  readonly authoringEditable?: boolean;
  readonly backgroundImageUrl?: string;
  readonly nestedGrid?: boolean;
  readonly titleText?: string;
}

export interface RenderRegisteredSurfaceVariantOptions {
  readonly authoringEditable?: boolean;
  readonly imageAlt?: string;
  readonly imageUrl?: string;
  readonly titleText?: string;
}

export async function renderCompositionStateCase(
  state: CompositionStateCase,
  options: RenderCompositionStateCaseOptions = {},
): Promise<RenderedCompositionStateCase> {
  const initialContent = createCompositionDocument(
    state,
    options.titleText,
    options.backgroundImageUrl,
    options.nestedGrid,
  );
  return renderDocumentPair(
    initialContent,
    `geometry-${state.composition}`,
    options.authoringEditable ?? false,
    describeState(state),
  );
}

export async function renderRegisteredSurfaceVariant(
  variant: string,
  options: RenderRegisteredSurfaceVariantOptions = {},
): Promise<RenderedCompositionStateCase> {
  return renderDocumentPair(
    createRegisteredSurfaceDocument(variant, options),
    `geometry-${variant}`,
    options.authoringEditable ?? false,
    `variant=${variant}`,
  );
}

export function createCompositionDocumentForTest(
  state: CompositionStateCase,
  options: Pick<RenderCompositionStateCaseOptions, "backgroundImageUrl" | "titleText"> = {},
): JSONContent {
  return createCompositionDocument(state, options.titleText, options.backgroundImageUrl);
}

async function renderDocumentPair(
  initialContent: JSONContent,
  visibleSurfaceId: string,
  authoringEditable: boolean,
  description: string,
): Promise<RenderedCompositionStateCase> {
  const authoringDocument = new Y.Doc();
  initializeAuthoringCourseDocumentFragment(authoringDocument, cloneJSON(initialContent));

  const harnessHost = globalThis.document.createElement("div");
  harnessHost.dataset["compositionBrowserHarness"] = "";
  harnessHost.style.position = "absolute";
  harnessHost.style.inset = "0 auto auto 0";
  harnessHost.style.width = `${INTRINSIC_WIDTH}px`;
  globalThis.document.body.append(harnessHost);

  const authoringHost = createRendererHost("authoring");
  const runtimeHost = createRendererHost("runtime");
  harnessHost.append(authoringHost, runtimeHost);

  const authoringRoot = createRoot(authoringHost);
  const runtimeRoot = createRoot(runtimeHost);
  let authoringEditor: TiptapEditor | null = null;
  let runtimeEditor: TiptapEditor | null = null;
  let disposed = false;

  try {
    const authoringReady = editorReadyPromise("authoring", (editor) => {
      authoringEditor = editor;
    });
    authoringRoot.render(
      <CourseDocumentEditor
        document={authoringDocument}
        editable={authoringEditable}
        onReady={authoringReady}
      />,
    );

    const runtimeReady = editorReadyPromise("runtime", (editor) => {
      runtimeEditor = editor;
    });
    runtimeRoot.render(
      <CourseDocumentRuntimeRenderer
        initialContent={cloneJSON(initialContent)}
        visibleSurfaceId={visibleSurfaceId}
        onReady={runtimeReady}
      />,
    );

    await waitForEditors(
      () => authoringEditor,
      () => runtimeEditor,
    );
    await waitForSemanticSurface(authoringHost, description, "authoring");
    await waitForSemanticSurface(runtimeHost, description, "runtime");
    await nextLayoutFrame();

    if (!authoringEditor || !runtimeEditor) {
      throw new Error(`Composition harness editors were not ready for ${description}.`);
    }

    const authoring = {
      renderer: "authoring",
      host: authoringHost,
      editor: authoringEditor,
    } as const;
    const runtime = {
      renderer: "runtime",
      host: runtimeHost,
      editor: runtimeEditor,
    } as const;

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      disposeRendererRoot(authoringRoot, authoring.editor);
      disposeRendererRoot(runtimeRoot, runtime.editor);
      authoringDocument.destroy();
      harnessHost.remove();
    };

    return {
      host: harnessHost,
      authoring,
      runtime,
      dispose,
      isDisposed: () => disposed,
    };
  } catch (error) {
    disposeRendererRoot(authoringRoot, authoringEditor);
    disposeRendererRoot(runtimeRoot, runtimeEditor);
    authoringDocument.destroy();
    harnessHost.remove();
    throw error;
  }
}

export function measureCompositionGeometry(
  mounted: MountedCompositionRenderer,
  state: CompositionStateCase,
): CompositionGeometrySample {
  const surface = uniqueElement(mounted.host, "[data-surface]", "surface", state, mounted.renderer);
  const surfaceRect = surface.getBoundingClientRect();
  if (
    !Number.isFinite(surfaceRect.width) ||
    !Number.isFinite(surfaceRect.height) ||
    surfaceRect.width <= 0 ||
    surfaceRect.height <= 0
  ) {
    throw new Error(
      `Invalid surface rectangle for ${mounted.renderer} ${describeState(state)}: ` +
        formatDOMRect(surfaceRect),
    );
  }

  const scaleX = surfaceRect.width / INTRINSIC_WIDTH;
  const scaleY = surfaceRect.height / INTRINSIC_HEIGHT;
  const elements = new Map<CompositionParticipantKey, HTMLElement>();
  elements.set("surface", surface);
  elements.set(
    "content-host",
    uniqueElement(surface, "[data-surface-content]", "content-host", state, mounted.renderer),
  );
  elements.set(
    "title",
    uniqueElement(surface, '[data-slot="slide-title"]', "title", state, mounted.renderer),
  );
  for (const role of state.regions) {
    const key = `region:${role}` as const;
    elements.set(
      key,
      uniqueElement(surface, `[data-region-role="${role}"]`, key, state, mounted.renderer),
    );
  }
  for (const role of state.images) {
    const key = `image:${role}` as const;
    elements.set(
      key,
      uniqueElement(surface, `[data-image-role="${role}"]`, key, state, mounted.renderer),
    );
  }

  const participants: Partial<Record<CompositionParticipantKey, IntrinsicRect>> = {};
  const rawParticipants: Partial<Record<CompositionParticipantKey, RawCompositionParticipant>> = {};
  for (const [key, element] of elements) {
    const domRect = element.getBoundingClientRect();
    const rect =
      key === "surface"
        ? { x: 0, y: 0, width: INTRINSIC_WIDTH, height: INTRINSIC_HEIGHT }
        : normaliseRect(domRect, surfaceRect, scaleX, scaleY);
    const style = globalThis.getComputedStyle(element);
    const hasLayoutBox =
      key === "surface" ||
      (element.getClientRects().length > 0 && domRect.width > 0 && domRect.height > 0);
    rawParticipants[key] = {
      rect,
      display: style.display,
      visibility: style.visibility,
      hasLayoutBox,
    };
    if (hasLayoutBox) participants[key] = rect;
  }

  return {
    state,
    renderer: mounted.renderer,
    surface: { x: 0, y: 0, width: INTRINSIC_WIDTH, height: INTRINSIC_HEIGHT },
    participants,
    rawParticipants,
  };
}

export function expectCompositionGeometry(
  sample: CompositionGeometrySample,
  relationships: readonly CompositionGeometryRelationship[] = COMPOSITION_GEOMETRY_ORACLE[
    sample.state.composition
  ],
): void {
  assertFiniteRect(sample.surface, "surface", sample);
  if (
    Math.abs(sample.surface.x) > RECT_TOLERANCE ||
    Math.abs(sample.surface.y) > RECT_TOLERANCE ||
    Math.abs(sample.surface.width - INTRINSIC_WIDTH) > RECT_TOLERANCE ||
    Math.abs(sample.surface.height - INTRINSIC_HEIGHT) > RECT_TOLERANCE
  ) {
    throw new Error(
      `Surface is not ${INTRINSIC_WIDTH}x${INTRINSIC_HEIGHT} for ${sample.renderer} ` +
        `${describeState(sample.state)}: ${JSON.stringify(sample.surface)}.`,
    );
  }

  for (const [key, rect] of Object.entries(sample.participants) as [
    CompositionParticipantKey,
    IntrinsicRect,
  ][]) {
    assertFiniteRect(rect, key, sample);
    if (
      rect.x < -RECT_TOLERANCE ||
      rect.y < -RECT_TOLERANCE ||
      rect.x + rect.width > INTRINSIC_WIDTH + RECT_TOLERANCE ||
      rect.y + rect.height > INTRINSIC_HEIGHT + RECT_TOLERANCE
    ) {
      throw new Error(
        `Participant "${key}" is outside the intrinsic surface for ${sample.renderer} ` +
          `${describeState(sample.state)}: ${JSON.stringify(rect)}.`,
      );
    }
  }

  for (const relationship of relationships) {
    expectGeometryRelationship(sample, relationship, relationships);
  }
}

export function expectCompositionRendererParity(
  authoring: CompositionGeometrySample,
  runtime: CompositionGeometrySample,
): void {
  const authoringKeys = (Object.keys(authoring.participants) as CompositionParticipantKey[]).sort();
  const runtimeKeys = (Object.keys(runtime.participants) as CompositionParticipantKey[]).sort();
  if (JSON.stringify(authoringKeys) !== JSON.stringify(runtimeKeys)) {
    throw new Error(
      `Renderer participant mismatch for ${describeState(authoring.state)}: ` +
        `authoring=[${authoringKeys.join(", ")}], runtime=[${runtimeKeys.join(", ")}].`,
    );
  }
  for (const key of authoringKeys) {
    const authoringRect = authoring.participants[key];
    const runtimeRect = runtime.participants[key];
    if (!authoringRect || !runtimeRect) continue;
    for (const field of ["x", "y", "width", "height"] as const) {
      if (!close(authoringRect[field], runtimeRect[field])) {
        throw new Error(
          `Renderer parity mismatch for ${key}.${field} in ${describeState(authoring.state)}: ` +
            `authoring=${authoringRect[field]}, runtime=${runtimeRect[field]}.`,
        );
      }
    }
  }
}

function expectGeometryRelationship(
  sample: CompositionGeometrySample,
  relationship: CompositionGeometryRelationship,
  relationships: readonly CompositionGeometryRelationship[],
): void {
  switch (relationship.kind) {
    case "presence":
      expectPresence(sample, relationship);
      return;
    case "topology":
      expectTopology(sample, relationship, relationships);
      return;
    case "order":
      expectOrder(sample, relationship, relationships);
      return;
    case "spanning":
      expectSpanning(sample, relationship);
      return;
    case "track-weights":
      expectTrackWeights(sample, relationship, relationships);
      return;
    case "spacing":
      expectSpacing(sample, relationship);
      return;
    case "reclamation":
      expectReclamation(sample, relationship, relationships);
      return;
    case "centring":
      expectCentring(sample, relationship);
      return;
    case "containment":
      expectContainment(sample, relationship);
  }
}

function expectPresence(
  sample: CompositionGeometrySample,
  relationship: Extract<CompositionGeometryRelationship, { kind: "presence" }>,
): void {
  const hidden = new Set(sample.state.title === "hidden" ? relationship.absentWhenTitleHidden : []);
  const expected = relationship.participants.filter((key) => !hidden.has(key)).sort();
  const actual = (Object.keys(sample.participants) as CompositionParticipantKey[]).sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    sample,
    relationship,
    `expected participants ${expected.join(", ")}, received ${actual.join(", ")}`,
  );
  for (const key of hidden) {
    const raw = sample.rawParticipants[key];
    assert(
      Boolean(raw) && raw?.hasLayoutBox === false && raw.display === "none",
      sample,
      relationship,
      `expected raw hidden participant ${key} to have display:none and no layout box`,
    );
  }
}

function expectTopology(
  sample: CompositionGeometrySample,
  relationship: Extract<CompositionGeometryRelationship, { kind: "topology" }>,
  relationships: readonly CompositionGeometryRelationship[],
): void {
  const rects = visibleRects(sample, relationship.participants);
  if (rects.length <= 1 || relationship.topology === "single") return;
  if (relationship.topology === "overlay") {
    const [first, ...rest] = rects;
    assert(
      Boolean(first) && rest.every((rect) => rectanglesOverlap(first?.rect, rect.rect)),
      sample,
      relationship,
      "expected overlay participants to overlap",
    );
    return;
  }
  if (relationship.topology === "rows") {
    const centred = new Set(
      relationships
        .filter((candidate) => candidate.kind === "centring")
        .map((candidate) => candidate.participant),
    );
    const comparable = rects.filter(({ key }) => !centred.has(key));
    const first = comparable[0]?.rect;
    assert(
      Boolean(first) &&
        comparable.every(({ rect }) => close(rect.x, first?.x) && close(rect.width, first?.width)),
      sample,
      relationship,
      "expected row participants to share inline bounds",
    );
    return;
  }
  const distinctColumns = new Set(rects.map(({ rect }) => rounded(rect.x)));
  assert(
    distinctColumns.size >= 2,
    sample,
    relationship,
    "expected column participants to occupy multiple inline positions",
  );
}

function expectOrder(
  sample: CompositionGeometrySample,
  relationship: Extract<CompositionGeometryRelationship, { kind: "order" }>,
  relationships: readonly CompositionGeometryRelationship[],
): void {
  const keys =
    sample.state.orientation === "reversed" && relationship.reversed
      ? relationship.reversed
      : relationship.default;
  const rects = visibleRects(sample, keys);
  if (sample.state.composition === "image-backdrop-panel") {
    const host = participantRect(sample, "content-host", relationship);
    assert(
      sample.state.orientation === "reversed"
        ? close(host.x, 32)
        : close(right(host), sample.surface.width - 32),
      sample,
      relationship,
      "expected the inset panel to occupy its declared logical side",
    );
    return;
  }
  const topology = relationships.find(
    (candidate) => candidate.kind === "topology" && candidate.level === relationship.level,
  );
  const field = topology?.kind === "topology" && topology.topology === "rows" ? "y" : "x";
  for (let index = 1; index < rects.length; index += 1) {
    assert(
      (rects[index - 1]?.rect[field] ?? Number.NaN) <=
        (rects[index]?.rect[field] ?? Number.NaN) + RECT_TOLERANCE,
      sample,
      relationship,
      `expected ${keys.join(", ")} in ${field} order`,
    );
  }
}

function expectSpanning(
  sample: CompositionGeometrySample,
  relationship: Extract<CompositionGeometryRelationship, { kind: "spanning" }>,
): void {
  const participant = sample.participants[relationship.participant];
  if (!participant) return;
  const across = visibleRects(sample, relationship.across).map(({ rect }) => rect);
  if (across.length === 0) return;
  const union = unionRect(across);
  assert(
    (close(participant.x, union.x) && close(right(participant), right(union))) ||
      (close(participant.y, union.y) && close(bottom(participant), bottom(union))),
    sample,
    relationship,
    `expected ${relationship.participant} to span ${relationship.across.join(", ")}`,
  );
}

function expectTrackWeights(
  sample: CompositionGeometrySample,
  relationship: Extract<CompositionGeometryRelationship, { kind: "track-weights" }>,
  relationships: readonly CompositionGeometryRelationship[],
): void {
  const rects = visibleRects(sample, relationship.participants);
  const topology = relationships.find(
    (candidate) => candidate.kind === "topology" && candidate.level === relationship.level,
  );
  const field = topology?.kind === "topology" && topology.topology === "rows" ? "height" : "width";
  if (relationship.weights === "equal") {
    const first = rects[0]?.rect[field];
    assert(
      first !== undefined && rects.every(({ rect }) => close(rect[field], first)),
      sample,
      relationship,
      "expected equal track weights",
    );
    return;
  }
  if (relationship.weights === "dominant-supporting") {
    const [dominant, ...supporting] = rects;
    assert(
      Boolean(dominant) &&
        supporting.every(({ rect }) => close(dominant?.rect[field], rect[field] * 2)),
      sample,
      relationship,
      "expected dominant track to be twice each supporting track",
    );
    return;
  }
  if (relationship.weights === "fixed-title-rail") {
    const title = rects.find(({ key }) => key === "title")?.rect;
    const main = rects.find(({ key }) => key === "region:main")?.rect;
    const contentHost = sample.participants["content-host"];
    assert(
      Boolean(title) &&
        Boolean(main) &&
        Boolean(contentHost) &&
        close(title?.width, 48) &&
        close(main?.width, (contentHost?.width ?? 0) - 64),
      sample,
      relationship,
      "expected a fixed 48px title rail and a main track that fills the remaining content width",
    );
    return;
  }
  const weights = proportionWeights(sample);
  if (rects.length === 1 && sample.state.composition === "image-backdrop-panel") {
    const host = rects[0]?.rect;
    const expected = (sample.surface.width * weights[0]) / (weights[0] + weights[1]) - 64;
    assert(
      Boolean(host) && close(host?.width, expected),
      sample,
      relationship,
      "expected inset panel width to follow the logical proportion",
    );
    return;
  }
  const firstTrack = rects[0]?.rect[field];
  const secondTrack = rects[1]?.rect[field];
  assert(
    rects.length === 2 &&
      firstTrack !== undefined &&
      secondTrack !== undefined &&
      close(firstTrack / weights[0], secondTrack / weights[1]),
    sample,
    relationship,
    "expected logical proportion to travel with participant roles",
  );
}

function expectSpacing(
  sample: CompositionGeometrySample,
  relationship: Extract<CompositionGeometryRelationship, { kind: "spacing" }>,
): void {
  const rects = visibleRects(sample, relationship.participants)
    .filter(({ key }) => key !== "surface")
    .map(({ rect }) => rect);
  if (rects.length === 0) return;
  const overlayContentInset =
    relationship.level === "content" &&
    relationship.inset === 32 &&
    (sample.state.composition === "full-bleed-image" ||
      sample.state.composition === "image-backdrop-panel");
  const container =
    relationship.level === "surface" || overlayContentInset
      ? sample.surface
      : participantRect(sample, "content-host", relationship);
  const insetRect = overlayContentInset
    ? participantRect(sample, "content-host", relationship)
    : unionRect(rects);
  const edges = [
    insetRect.x - container.x,
    insetRect.y - container.y,
    right(container) - right(insetRect),
    bottom(container) - bottom(insetRect),
  ];
  const matchingEdges = edges.filter((value) => close(value, relationship.inset)).length;
  assert(
    matchingEdges >= (overlayContentInset ? 2 : 4),
    sample,
    relationship,
    `expected ${relationship.inset}px inset, received edges ${edges.join(", ")}`,
  );
  const gapRects = visibleRects(sample, relationship.participants)
    .filter(({ key }) => key !== "surface" && key !== "content-host")
    .map(({ rect }) => rect);
  if (relationship.gap === 0 || gapRects.length <= 1) return;
  const gaps = pairwiseGaps(gapRects);
  assert(
    gaps.some((gap) => close(gap, relationship.gap)),
    sample,
    relationship,
    `expected a ${relationship.gap}px participant gap`,
  );
}

function expectReclamation(
  sample: CompositionGeometrySample,
  relationship: Extract<CompositionGeometryRelationship, { kind: "reclamation" }>,
  relationships: readonly CompositionGeometryRelationship[],
): void {
  if (sample.state.title !== "hidden") return;
  const rects = visibleRects(sample, relationship.participants).map(({ rect }) => rect);
  assert(
    rects.length > 0,
    sample,
    relationship,
    "expected reclaimed participants to remain visible",
  );
  const union = unionRect(rects);
  const container =
    relationship.level === "content"
      ? participantRect(sample, "content-host", relationship)
      : sample.surface;
  if (sample.state.composition === "image-backdrop-panel") {
    assert(
      close(union.y, container.y + 24) && close(bottom(union), bottom(container) - 24),
      sample,
      relationship,
      "expected the hidden-title panel body to fill the panel content box",
    );
    return;
  }
  const spacing = relationships.find(
    (candidate) => candidate.kind === "spacing" && candidate.level === relationship.level,
  );
  const inset = spacing?.kind === "spacing" ? spacing.inset : 0;
  assert(
    close(union.y, container.y + inset) && close(bottom(union), bottom(container) - inset),
    sample,
    relationship,
    "expected hidden-title participants to reclaim the title row and adjacent gap",
  );
}

function expectCentring(
  sample: CompositionGeometrySample,
  relationship: Extract<CompositionGeometryRelationship, { kind: "centring" }>,
): void {
  const rect = participantRect(sample, relationship.participant, relationship);
  const container = participantRect(sample, "content-host", relationship);
  assert(
    rect.width < container.width && close(rect.x - container.x, right(container) - right(rect)),
    sample,
    relationship,
    `expected ${relationship.participant} to be bounded and centred inline`,
  );
}

function expectContainment(
  sample: CompositionGeometrySample,
  relationship: Extract<CompositionGeometryRelationship, { kind: "containment" }>,
): void {
  const children = visibleRects(sample, relationship.participants);
  if (children.length === 0) return;
  const container = participantRect(sample, relationship.container, relationship);
  for (const { key, rect } of children) {
    assert(
      containsRect(container, rect),
      sample,
      relationship,
      `expected ${relationship.container} to contain ${key}`,
    );
  }
}

function createCompositionDocument(
  state: CompositionStateCase,
  titleText?: string,
  backgroundImageUrl?: string,
  nestedGrid = false,
): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get(state.variant);
  if (
    !definition ||
    !isRegisteredSlideCompositionSurfaceDefinition(definition) ||
    definition.slideComposition.id !== state.composition
  ) {
    throw new Error(`No matching registered definition exists for ${describeState(state)}.`);
  }

  const surface = definition.createSurface({ surfaceId: `geometry-${state.composition}` });
  const baseSettings = isRecord(surface.attrs?.["settings"]) ? surface.attrs?.["settings"] : {};
  const settings = definition.settingsSchema.parse({
    ...baseSettings,
    ...(backgroundImageUrl
      ? { background: { imageUrl: backgroundImageUrl, imageAlt: "Backdrop" } }
      : {}),
    ...(state.title === "required" ? {} : { slideTitle: { enabled: state.title === "visible" } }),
    ...(state.orientation ? { orientation: state.orientation } : {}),
    ...(state.proportion ? { proportion: state.proportion } : {}),
  });
  if (!surface.content) {
    throw new Error(`Registered definition created no fixed children for ${describeState(state)}.`);
  }
  const populatedSurface: JSONContent = {
    ...surface,
    attrs: { ...surface.attrs, settings },
    content: surface.content.map((child) => {
      if (child.type === "slide_title") {
        const text = titleText ?? "Geometry title";
        return { ...child, content: text ? [{ type: "text", text }] : [] };
      }
      if (child.type === "region") {
        const role = String(child.attrs?.["role"]);
        return {
          ...child,
          content:
            nestedGrid && role === "primary"
              ? [nestedGridContent()]
              : [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: `Geometry ${role}` }],
                  },
                ],
        };
      }
      return child;
    }),
  };
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: `geometry-${state.composition}`,
  });
  const courseDocument = content.content?.[0];
  if (courseDocument?.type !== "courseDocument") {
    throw new Error(`Could not create a slideshow document for ${describeState(state)}.`);
  }
  courseDocument.content = [populatedSurface];
  return content;
}

function createRegisteredSurfaceDocument(
  variant: string,
  options: RenderRegisteredSurfaceVariantOptions,
): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get(variant);
  if (!definition || !definition.modes.includes("slideshow")) {
    throw new Error(`No registered slideshow surface definition exists for variant=${variant}.`);
  }

  const surfaceId = `geometry-${variant}`;
  const surface = definition.createSurface({ surfaceId });
  const baseSettings = isRecord(surface.attrs?.["settings"]) ? surface.attrs?.["settings"] : {};
  const settingsInput =
    options.imageUrl && (variant === "slide-image-cover" || variant === "slide-image-band")
      ? {
          ...baseSettings,
          image: { imageUrl: options.imageUrl, imageAlt: options.imageAlt ?? "" },
        }
      : baseSettings;
  const settings = definition.settingsSchema?.parse(settingsInput) ?? settingsInput;
  let subtitleIndex = 0;
  const populatedSurface: JSONContent = {
    ...surface,
    attrs: { ...surface.attrs, settings },
    ...(surface.content
      ? {
          content: surface.content.map((child) => {
            if (child.type === "heading") {
              return {
                ...child,
                content: [{ type: "text", text: options.titleText ?? "Catalogue title" }],
              };
            }
            if (child.type === "slide_cover_subtitle") {
              subtitleIndex += 1;
              return {
                ...child,
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: `Subtitle ${subtitleIndex}` }],
                  },
                ],
              };
            }
            return child;
          }),
        }
      : {}),
  };
  const content = createScaffoldDocumentContent({ mode: "slideshow", surfaceId });
  const courseDocument = content.content?.[0];
  if (courseDocument?.type !== "courseDocument") {
    throw new Error(`Could not create a slideshow document for variant=${variant}.`);
  }
  courseDocument.content = [populatedSurface];
  return content;
}

function nestedGridContent(): JSONContent {
  return {
    type: "grid",
    attrs: { columnWidths: [1, 1], id: "geometry-nested-grid" },
    content: [
      {
        type: "cell",
        attrs: { id: "geometry-nested-cell-a" },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Nested grid alpha" }],
          },
        ],
      },
      {
        type: "cell",
        attrs: { id: "geometry-nested-cell-b" },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Nested grid beta" }],
          },
        ],
      },
    ],
  };
}

function createRendererHost(renderer: "authoring" | "runtime"): HTMLElement {
  const host = globalThis.document.createElement("div");
  host.dataset["compositionRenderer"] = renderer;
  if (renderer === "runtime") {
    host.className = "sc-slideshow-player__viewport sc-slideshow-player__canvas";
  }
  host.style.boxSizing = "border-box";
  host.style.width = `${INTRINSIC_WIDTH}px`;
  host.style.height = `${INTRINSIC_HEIGHT}px`;
  return host;
}

function editorReadyPromise(
  renderer: "authoring" | "runtime",
  setEditor: (editor: TiptapEditor) => void,
): (editor: TiptapEditor) => void {
  return (editor) => {
    if (editor.isDestroyed) {
      throw new Error(`The ${renderer} editor was destroyed before harness readiness.`);
    }
    setEditor(editor);
  };
}

async function waitForEditors(
  getAuthoring: () => TiptapEditor | null,
  getRuntime: () => TiptapEditor | null,
): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!getAuthoring() || !getRuntime()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for composition authoring/runtime editors.");
    }
    await nextAnimationFrame();
  }
}

async function waitForSemanticSurface(
  host: HTMLElement,
  description: string,
  renderer: "authoring" | "runtime",
): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!host.querySelector("[data-surface]")) {
    if (performance.now() > deadline) {
      throw new Error(`Timed out waiting for ${renderer} DOM for ${description}.`);
    }
    await nextAnimationFrame();
  }
}

async function nextLayoutFrame(): Promise<void> {
  await nextAnimationFrame();
  await nextAnimationFrame();
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function uniqueElement(
  root: ParentNode,
  selector: string,
  participant: CompositionParticipantKey,
  state: CompositionStateCase,
  renderer: "authoring" | "runtime",
): HTMLElement {
  const matches = root.querySelectorAll(selector);
  if (matches.length !== 1 || !(matches[0] instanceof HTMLElement)) {
    throw new Error(
      `Expected one ${renderer} participant "${participant}" for ${describeState(state)}, ` +
        `found ${matches.length} with selector ${selector}.`,
    );
  }
  return matches[0];
}

function normaliseRect(
  rect: DOMRect,
  surface: DOMRect,
  scaleX: number,
  scaleY: number,
): IntrinsicRect {
  return {
    x: roundIntrinsic((rect.left - surface.left) / scaleX),
    y: roundIntrinsic((rect.top - surface.top) / scaleY),
    width: roundIntrinsic(rect.width / scaleX),
    height: roundIntrinsic(rect.height / scaleY),
  };
}

function roundIntrinsic(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function assertFiniteRect(
  rect: IntrinsicRect,
  participant: CompositionParticipantKey,
  sample: CompositionGeometrySample,
): void {
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new Error(
      `Participant "${participant}" has an invalid rectangle for ${sample.renderer} ` +
        `${describeState(sample.state)}: ${JSON.stringify(rect)}.`,
    );
  }
}

function visibleRects(
  sample: CompositionGeometrySample,
  keys: readonly CompositionParticipantKey[],
): readonly { readonly key: CompositionParticipantKey; readonly rect: IntrinsicRect }[] {
  return keys.flatMap((key) => {
    const rect = sample.participants[key];
    return rect ? [{ key, rect }] : [];
  });
}

function participantRect(
  sample: CompositionGeometrySample,
  key: CompositionParticipantKey,
  relationship: CompositionGeometryRelationship,
): IntrinsicRect {
  const rect = sample.participants[key];
  assert(Boolean(rect), sample, relationship, `missing participant ${key}`);
  return rect ?? sample.surface;
}

function proportionWeights(sample: CompositionGeometrySample): readonly [number, number] {
  switch (sample.state.proportion) {
    case "one-third-two-thirds":
      return [1, 2];
    case "two-thirds-one-third":
      return [2, 1];
    case "equal":
      return [1, 1];
    default:
      throw new Error(`Missing proportion for ${describeState(sample.state)}.`);
  }
}

function unionRect(rects: readonly IntrinsicRect[]): IntrinsicRect {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const rightEdge = Math.max(...rects.map(right));
  const bottomEdge = Math.max(...rects.map(bottom));
  return { x: left, y: top, width: rightEdge - left, height: bottomEdge - top };
}

function pairwiseGaps(rects: readonly IntrinsicRect[]): readonly number[] {
  const gaps: number[] = [];
  for (let leftIndex = 0; leftIndex < rects.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rects.length; rightIndex += 1) {
      const first = rects[leftIndex];
      const second = rects[rightIndex];
      if (!first || !second) continue;
      const horizontal = Math.max(second.x - right(first), first.x - right(second));
      const vertical = Math.max(second.y - bottom(first), first.y - bottom(second));
      if (horizontal >= -RECT_TOLERANCE) gaps.push(Math.max(0, horizontal));
      if (vertical >= -RECT_TOLERANCE) gaps.push(Math.max(0, vertical));
    }
  }
  return gaps;
}

function rectanglesOverlap(first: IntrinsicRect | undefined, second: IntrinsicRect): boolean {
  if (!first) return false;
  return (
    first.x < right(second) &&
    right(first) > second.x &&
    first.y < bottom(second) &&
    bottom(first) > second.y
  );
}

function containsRect(container: IntrinsicRect, child: IntrinsicRect): boolean {
  return (
    container.x <= child.x + RECT_TOLERANCE &&
    container.y <= child.y + RECT_TOLERANCE &&
    right(container) + RECT_TOLERANCE >= right(child) &&
    bottom(container) + RECT_TOLERANCE >= bottom(child)
  );
}

function right(rect: IntrinsicRect): number {
  return rect.x + rect.width;
}

function bottom(rect: IntrinsicRect): number {
  return rect.y + rect.height;
}

function close(actual: number | undefined, expected: number | undefined): boolean {
  return (
    actual !== undefined && expected !== undefined && Math.abs(actual - expected) <= RECT_TOLERANCE
  );
}

function rounded(value: number): number {
  return Math.round(value / RECT_TOLERANCE) * RECT_TOLERANCE;
}

function assert(
  condition: boolean,
  sample: CompositionGeometrySample,
  relationship: CompositionGeometryRelationship,
  message: string,
): asserts condition {
  if (condition) return;
  throw new Error(
    `${message} for ${sample.renderer} ${describeState(sample.state)} ` +
      `relationship=${JSON.stringify(relationship)} participants=${JSON.stringify(sample.participants)}.`,
  );
}

function disposeRendererRoot(root: Root, editor: TiptapEditor | null): void {
  root.unmount();
  if (editor && !editor.isDestroyed) editor.destroy();
}

function cloneJSON(content: JSONContent): JSONContent {
  return JSON.parse(JSON.stringify(content)) as JSONContent;
}

function formatDOMRect(rect: DOMRect): string {
  return JSON.stringify({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
}

function describeState(state: CompositionStateCase): string {
  return (
    `variant=${state.variant}, composition=${state.composition}, title=${state.title}, ` +
    `orientation=${state.orientation ?? "none"}, proportion=${state.proportion ?? "none"}`
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
