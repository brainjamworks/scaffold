import { useState } from "react";

import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";
import { MediaEmptyAction } from "@/editor/media/authoring/shared-components/MediaEmptyAction";
import { MediaReplaceButton } from "@/editor/media/authoring/shared-components/MediaReplaceButton";

import {
  isRegisteredSlideCompositionSurfaceDefinition,
  type SurfaceImageSlotRole,
} from "../../model/slide-composition-definition";
import { SurfaceOwnedImageSchema } from "../../model/surface-owned-image";
import { setSurfaceOwnedImageChecked } from "../commands/surface-image-settings-command";
import { resolveSurfaceImagePick } from "../chrome/surface-image-pick";
import { slideCompositionDataAttrs } from "../../view/variants/slide-composition";
import { SurfaceOwnedImageSlot } from "../../view/variants/surface-owned-image-slot";
import "../../view/variants/slide-layout.css";
import { SurfaceAuthoringFrame } from "../views/SurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../surface-authoring-view-registry";

export function SlideCompositionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  const [activeRole, setActiveRole] = useState<SurfaceImageSlotRole | null>(null);
  const definition = props.definition;
  if (!isRegisteredSlideCompositionSurfaceDefinition(definition)) {
    throw new Error(`Surface variant "${props.variant}" is not a slide composition definition.`);
  }
  const images = readImages(definition.settingsSchema.safeParse(props.node.attrs["settings"]));

  const handlePickerResolved = (result: FilePickerResult) => {
    if (!activeRole) return false;
    const image = resolveSurfaceImagePick(result);
    if (!image) return false;
    const checked = setSurfaceOwnedImageChecked({
      definition,
      editor: props.editor,
      surfaceId: props.node.attrs["id"],
      role: activeRole,
      image,
    });
    if (!checked.ok) return false;
    setActiveRole(null);
    return true;
  };

  return (
    <SurfaceAuthoringFrame
      {...props}
      attributes={slideCompositionDataAttrs(definition, props.node.attrs["settings"])}
      className="sc-slide-layout-surface-view sc-slide-layout-surface-authoring-view"
    >
      {definition.slideComposition.imageSlots.map((role) => {
        const image = readOptionalImage(images?.[role]);
        const canChoose = props.editor.isEditable && image !== undefined;
        const chooseImage = () => setActiveRole(role);
        return (
          <SurfaceOwnedImageSlot
            key={role}
            role={role}
            {...(image ? { image } : {})}
            emptyAction={
              canChoose ? (
                <MediaEmptyAction
                  className="sc-surface-owned-image-slot__empty"
                  aria-label={`Choose ${role} image`}
                  label={`Choose ${role} image`}
                  onClick={chooseImage}
                />
              ) : null
            }
            replaceAction={
              canChoose ? (
                <MediaReplaceButton aria-label={`Replace ${role} image`} onClick={chooseImage} />
              ) : null
            }
          />
        );
      })}
      <FilePickerModal
        open={activeRole !== null}
        onOpenChange={(open) => {
          if (!open) setActiveRole(null);
        }}
        kind="media"
        allowedMediaTypes={["image"]}
        defaultMediaType="image"
        title={activeRole ? `Choose ${activeRole} image` : "Choose image"}
        onResolved={handlePickerResolved}
      />
    </SurfaceAuthoringFrame>
  );
}

function readImages(result: { success: boolean; data?: unknown }) {
  if (!result.success || !isRecord(result.data)) return undefined;
  const images = result.data["images"];
  return isRecord(images) ? images : undefined;
}

function readOptionalImage(value: unknown) {
  const parsed = SurfaceOwnedImageSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
