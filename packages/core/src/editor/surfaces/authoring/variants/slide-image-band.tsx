import { useState } from "react";

import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";
import { MediaEmptyAction } from "@/editor/media/authoring/shared-components/MediaEmptyAction";
import { MediaReplaceButton } from "@/editor/media/authoring/shared-components/MediaReplaceButton";
import {
  readSlideImageBandSurfaceSettings,
  slideImageBandDataAttrs,
  writeSlideImageBandImageSettings,
} from "@/editor/surfaces/model/templates/slide-image-band";
import { setSurfaceSettingsChecked } from "@/editor/surfaces/authoring/commands/surface-settings-command";
import { resolveSlideImageBandImagePick } from "@/editor/surfaces/authoring/chrome/surface-image-pick";

import { SlideImageBandImageSlot } from "../../view/variants/slide-image-band-image";
import { SurfaceAuthoringFrame } from "../views/SurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../surface-authoring-view-registry";
import "../../view/variants/slide-image-band.css";

export function SlideImageBandSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const settings = readSlideImageBandSurfaceSettings(props.node.attrs["settings"]);

  const handlePickerResolved = (result: FilePickerResult) => {
    const image = resolveSlideImageBandImagePick(result);
    if (!image) return;
    const checked = setSurfaceSettingsChecked({
      editor: props.editor,
      surfaceId: props.node.attrs["id"],
      schema: props.definition.settingsSchema,
      value: writeSlideImageBandImageSettings(props.node.attrs["settings"], image),
    });
    if (!checked.ok) return;
    setPickerOpen(false);
  };

  return (
    <SurfaceAuthoringFrame
      {...props}
      attributes={slideImageBandDataAttrs(props.node.attrs["settings"])}
      className="sc-slide-image-band-surface-view sc-slide-image-band-surface-authoring-view"
    >
      <SlideImageBandImageSlot
        emptyAction={
          props.editor.isEditable ? (
            <MediaEmptyAction
              className="sc-slide-image-band-image__empty"
              aria-label="Choose band image"
              label="Choose band image"
              onClick={() => setPickerOpen(true)}
            />
          ) : null
        }
        image={settings.image}
        replaceAction={
          props.editor.isEditable ? (
            <MediaReplaceButton
              aria-label="Replace band image"
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
        title={settings.image.imageUrl ? "Replace band image" : "Choose band image"}
        onResolved={handlePickerResolved}
      />
    </SurfaceAuthoringFrame>
  );
}
