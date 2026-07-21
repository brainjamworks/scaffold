import { useState } from "react";

import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";
import { MediaEmptyAction } from "@/editor/media/authoring/shared-components/MediaEmptyAction";
import { MediaReplaceButton } from "@/editor/media/authoring/shared-components/MediaReplaceButton";
import {
  readSlideImageCoverSurfaceSettings,
  slideImageCoverDataAttrs,
  writeSlideImageCoverImageSettings,
} from "@/editor/surfaces/model/templates/slide-image-cover";
import { setSurfaceSettingsChecked } from "@/editor/surfaces/authoring/commands/surface-settings-command";
import { resolveSlideImageCoverImagePick } from "@/editor/surfaces/authoring/chrome/surface-image-pick";

import { SlideImageCoverImageSlot } from "../../view/variants/slide-image-cover-image";
import { SurfaceAuthoringFrame } from "../views/SurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../surface-authoring-view-registry";
import "../../view/variants/slide-image-cover.css";

export function SlideImageCoverSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const settings = readSlideImageCoverSurfaceSettings(props.node.attrs["settings"]);

  const handlePickerResolved = (result: FilePickerResult) => {
    const image = resolveSlideImageCoverImagePick(result);
    if (!image) return;
    const checked = setSurfaceSettingsChecked({
      editor: props.editor,
      surfaceId: props.node.attrs["id"],
      schema: props.definition.settingsSchema,
      value: writeSlideImageCoverImageSettings(props.node.attrs["settings"], image),
    });
    if (!checked.ok) return;
    setPickerOpen(false);
  };

  return (
    <SurfaceAuthoringFrame
      {...props}
      attributes={slideImageCoverDataAttrs(props.node.attrs["settings"])}
      className="sc-slide-image-cover-surface-view sc-slide-image-cover-surface-authoring-view"
    >
      <SlideImageCoverImageSlot
        emptyAction={
          props.editor.isEditable ? (
            <MediaEmptyAction
              className="sc-slide-image-cover-image__empty"
              aria-label="Choose cover image"
              label="Choose cover image"
              onClick={() => setPickerOpen(true)}
            />
          ) : null
        }
        image={settings.image}
        replaceAction={
          props.editor.isEditable ? (
            <MediaReplaceButton
              aria-label="Replace cover image"
              onClick={() => setPickerOpen(true)}
            />
          ) : null
        }
      />
      <FilePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="media"
        defaultMediaType="image"
        title={settings.image.imageUrl ? "Replace cover image" : "Choose cover image"}
        onResolved={handlePickerResolved}
      />
    </SurfaceAuthoringFrame>
  );
}
