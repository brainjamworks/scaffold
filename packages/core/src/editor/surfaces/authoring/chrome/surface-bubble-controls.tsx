import {
  GearSixIcon as Gear,
  SpeakerHighIcon as Speaker,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import {
  EmbeddedNodeIdSchema,
  PresentationConfigurationV1Schema,
  type SurfacePresentationNarrationV1,
} from "@scaffold/contracts";
import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";
import {
  setPresentationSurfaceNarration,
  setPresentationSurfaceDuration,
  type PresentationAuthoringCommandError,
} from "@/editor/presentation/model";
import {
  presentPresentationNarrationMetadataError,
  resolvePresentationNarrationMetadata,
  type PresentationNarrationMetadataError,
} from "@/editor/presentation/narration/presentation-narration-metadata";
import { presentPresentationAuthoringCommandError } from "@/editor/presentation/timeline/PresentationActionEditor";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import { ConfigurationMenuControls } from "@/editor/shell/bubbles/interaction/menu-controls/ConfigurationMenuControls";
import {
  MenuIconButton,
  MenuSeparator,
} from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";
import {
  InteractionTargetKind,
  sameInteractionTarget,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import {
  useInteractionCommands,
  useInteractionSnapshot,
} from "@/editor/interactions/targets/facade/interaction-provider";
import type {
  StructuralChromeTargetDescriptor,
  SurfaceChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import type {
  StructuralInteractionBubbleRenderer,
  StructuralInteractionBubbleRendererBinding,
} from "@/editor/interactions/interaction-bubble";

import { CopySurface, DeleteSurface, DuplicateSurface } from "./actions";

import type {
  SurfaceAuthoringChrome,
  SurfaceAuthoringChromeResolver,
} from "../surface-authoring-view-registry";

export interface SurfaceMenuSnapshot {
  defaultActions?: {
    copyLabel?: string;
    deleteLabel: string;
    duplicateLabel: string;
  };
  authoringChrome?: SurfaceAuthoringChrome;
  presentation?: {
    readonly narration: SurfacePresentationNarrationV1 | null;
    readonly durationMs: number;
  };
  surfaceId?: string;
  surfacePos: number;
}

interface SurfaceMenuBubbleContentProps {
  descriptor: SurfaceChromeTargetDescriptor;
  editor: Editor;
  snapshot: SurfaceMenuSnapshot | null;
}

export function SurfaceMenuBubbleContent({
  descriptor,
  editor,
  snapshot,
}: SurfaceMenuBubbleContentProps) {
  const commands = useInteractionCommands();
  const mediaPort = useMediaPort();
  const settingsOwnerTarget = useInteractionSnapshot().owners.settingsOwner.target;
  const mountedRef = useRef(false);
  const [narrationPickerOpen, setNarrationPickerOpen] = useState(false);
  const [narrationError, setNarrationError] = useState<PresentationAuthoringCommandError | null>(
    null,
  );
  const [narrationMetadataError, setNarrationMetadataError] =
    useState<PresentationNarrationMetadataError | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  if (!snapshot) return null;

  const quickMenu = snapshot.authoringChrome?.quickMenu;
  const settingsSheet = resolveSurfaceSettingsSheet(snapshot);
  const hasDefaultActions = Boolean(snapshot.defaultActions);
  const hasQuickMenu = Boolean(quickMenu?.controls.length);
  const hasPresentationControls = Boolean(snapshot.presentation && snapshot.surfaceId);
  const settingsSheetOpen = Boolean(
    settingsOwnerTarget && sameInteractionTarget(settingsOwnerTarget, descriptor.target),
  );

  const applyNarration = (narration: SurfacePresentationNarrationV1 | null) => {
    if (!snapshot.surfaceId) throw new Error("Surface narration requires a stable Surface ID.");
    const result = setPresentationSurfaceNarration({
      editor,
      surfaceId: EmbeddedNodeIdSchema.parse(snapshot.surfaceId),
      narration,
    });
    setNarrationError(result.isErr() ? result.error : null);
    setNarrationMetadataError(null);
    return result.isOk();
  };

  const handleNarrationResolved = (result: FilePickerResult) => {
    const source = narrationSourceFromPickerResult(result);
    if (!source) throw new Error("The audio picker returned no media source.");
    if (!applyNarration({ source })) return false;
    const surfaceId = EmbeddedNodeIdSchema.parse(snapshot.surfaceId);
    resolvePresentationNarrationMetadata({
      source,
      mediaPort,
      createAudioElement: () => new Audio(),
      onResult: (metadataResult) => {
        if (metadataResult.isErr()) {
          if (mountedRef.current) setNarrationMetadataError(metadataResult.error);
          return;
        }
        const current = resolveSurfacePresentation(editor, surfaceId, readCourseMode(editor));
        if (!current || !sameNarrationSource(current.narration?.source, source)) return;
        if (metadataResult.value.durationMs <= current.durationMs) return;
        const durationResult = setPresentationSurfaceDuration({
          editor,
          surfaceId,
          durationMs: metadataResult.value.durationMs,
        });
        if (mountedRef.current) {
          setNarrationError(durationResult.isErr() ? durationResult.error : null);
        }
      },
    });
    return true;
  };

  return (
    <>
      {snapshot.defaultActions ? (
        <>
          {snapshot.defaultActions.copyLabel ? (
            <CopySurface
              editor={editor}
              {...(snapshot.surfaceId !== undefined ? { surfaceId: snapshot.surfaceId } : {})}
              label={snapshot.defaultActions.copyLabel}
            />
          ) : null}
          <DuplicateSurface
            editor={editor}
            {...(snapshot.surfaceId !== undefined ? { surfaceId: snapshot.surfaceId } : {})}
            label={snapshot.defaultActions.duplicateLabel}
          />
          <DeleteSurface
            editor={editor}
            {...(snapshot.surfaceId !== undefined ? { surfaceId: snapshot.surfaceId } : {})}
            label={snapshot.defaultActions.deleteLabel}
          />
        </>
      ) : null}
      {hasDefaultActions && hasPresentationControls ? <MenuSeparator /> : null}
      {hasPresentationControls ? (
        <>
          <MenuIconButton
            icon={Speaker}
            label={snapshot.presentation?.narration ? "Replace narration" : "Add narration"}
            onClick={() => setNarrationPickerOpen(true)}
          />
          {snapshot.presentation?.narration ? (
            <MenuIconButton
              destructive
              icon={Trash}
              label="Remove narration"
              onClick={() => applyNarration(null)}
            />
          ) : null}
          <FilePickerModal
            open={narrationPickerOpen}
            onOpenChange={setNarrationPickerOpen}
            kind="media"
            allowedMediaTypes={["audio"]}
            defaultMediaType="audio"
            title={snapshot.presentation?.narration ? "Replace narration" : "Add narration"}
            metadataFields={[]}
            onResolved={handleNarrationResolved}
          />
          {narrationError ? (
            <span role="alert">{presentPresentationAuthoringCommandError(narrationError)}</span>
          ) : null}
          {narrationMetadataError ? (
            <span role="alert">
              {presentPresentationNarrationMetadataError(narrationMetadataError)}
            </span>
          ) : null}
        </>
      ) : null}
      {(hasDefaultActions || hasPresentationControls) && hasQuickMenu ? <MenuSeparator /> : null}
      {hasQuickMenu && quickMenu ? (
        <ConfigurationMenuControls
          editor={editor}
          nodeType="surface"
          pos={snapshot.surfacePos}
          targetId={snapshot.surfaceId ?? null}
          attr={quickMenu.attr}
          schema={quickMenu.schema}
          {...(quickMenu.editSchema ? { editSchema: quickMenu.editSchema } : {})}
          {...(quickMenu.read ? { read: quickMenu.read } : {})}
          {...(quickMenu.apply ? { apply: quickMenu.apply } : {})}
          controls={quickMenu.controls}
        />
      ) : null}
      {(hasDefaultActions || hasPresentationControls || hasQuickMenu) && settingsSheet ? (
        <MenuSeparator />
      ) : null}
      {settingsSheet ? (
        <MenuIconButton
          active={settingsSheetOpen}
          icon={Gear}
          label="Open surface settings"
          onClick={() => {
            commands.openSettings(descriptor.target);
          }}
        />
      ) : null}
    </>
  );
}

function resolveSurfaceSettingsSheet(
  snapshot: SurfaceMenuSnapshot,
): SurfaceAuthoringChrome["settingsSheet"] {
  return snapshot.authoringChrome?.settingsSheet;
}

export function resolveSurfaceMenuSnapshot(
  editor: Editor,
  descriptor: StructuralChromeTargetDescriptor | null | undefined,
  authoringChromeResolver: SurfaceAuthoringChromeResolver,
): SurfaceMenuSnapshot | null {
  if (descriptor?.kind !== InteractionTargetKind.Surface) return null;

  const courseMode = readCourseMode(editor);
  const defaultActions = surfaceDefaultActionsForMode(courseMode);
  const presentation = resolveSurfacePresentation(editor, descriptor.id, courseMode);
  const authoringChrome = descriptor.variant
    ? authoringChromeResolver.resolve(descriptor.variant)
    : undefined;

  return {
    ...(defaultActions ? { defaultActions } : {}),
    ...(authoringChrome ? { authoringChrome } : {}),
    ...(presentation ? { presentation } : {}),
    ...(descriptor.id ? { surfaceId: descriptor.id } : {}),
    surfacePos: descriptor.pos,
  };
}

export function surfaceMenuSnapshotHasControls(
  snapshot: SurfaceMenuSnapshot | null,
): snapshot is SurfaceMenuSnapshot {
  return Boolean(
    snapshot &&
    (snapshot.defaultActions ||
      snapshot.presentation ||
      snapshot.authoringChrome?.quickMenu?.controls.length ||
      snapshot.authoringChrome?.settingsSheet),
  );
}

function resolveSurfacePresentation(
  editor: Editor,
  surfaceId: string | null | undefined,
  courseMode: string | null,
): SurfaceMenuSnapshot["presentation"] | undefined {
  if (courseMode !== "slideshow" || !surfaceId) return undefined;
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument) throw new Error("The Course Document is missing.");
  const value = courseDocument.attrs["presentation"];
  if (value === null || value === undefined) return { narration: null, durationMs: 0 };
  const configuration = PresentationConfigurationV1Schema.parse(value);
  const timeline = configuration.surfaces.find((candidate) => candidate.surfaceId === surfaceId);
  if (!timeline) {
    throw new Error(`Presentation configuration has no Timeline for Surface "${surfaceId}".`);
  }
  return { narration: timeline.narration ?? null, durationMs: timeline.durationMs };
}

function sameNarrationSource(
  current: SurfacePresentationNarrationV1["source"] | undefined,
  expected: SurfacePresentationNarrationV1["source"],
): boolean {
  if (!current || current.mode !== expected.mode) return false;
  if (current.mode === "managed") {
    return expected.mode === "managed" && current.mediaId === expected.mediaId;
  }
  return expected.mode === "external" && current.src === expected.src;
}

function narrationSourceFromPickerResult(
  result: FilePickerResult,
): SurfacePresentationNarrationV1["source"] | null {
  if (result.source === "upload" && result.upload) {
    return { mode: "managed", mediaId: result.upload.id };
  }
  if (result.source === "browse" && result.browse) {
    return { mode: "managed", mediaId: result.browse.id };
  }
  if (result.source === "url" && result.url) {
    return { mode: "external", src: result.url };
  }
  return null;
}

function readCourseMode(editor: Editor): string | null {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument || courseDocument.type.name !== "courseDocument") {
    return null;
  }

  const mode = courseDocument.attrs["mode"];
  return typeof mode === "string" ? mode : null;
}

function surfaceDefaultActionsForMode(
  mode: string | null,
): SurfaceMenuSnapshot["defaultActions"] | undefined {
  if (mode === "page") return undefined;
  if (mode === "slideshow") {
    return {
      copyLabel: "Copy slide",
      deleteLabel: "Delete slide",
      duplicateLabel: "Duplicate slide",
    };
  }

  return {
    deleteLabel: "Delete surface",
    duplicateLabel: "Duplicate surface",
  };
}

export function createSurfaceStructuralInteractionBubbleRendererBinding(
  authoringChromeResolver: SurfaceAuthoringChromeResolver,
): StructuralInteractionBubbleRendererBinding {
  const renderer: StructuralInteractionBubbleRenderer = ({ descriptor, editor }) => {
    if (descriptor.kind !== InteractionTargetKind.Surface) return null;
    const snapshot = resolveSurfaceMenuSnapshot(editor, descriptor, authoringChromeResolver);
    if (!surfaceMenuSnapshotHasControls(snapshot)) return null;
    return <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />;
  };

  return Object.freeze({
    kind: InteractionTargetKind.Surface,
    renderer,
  });
}
