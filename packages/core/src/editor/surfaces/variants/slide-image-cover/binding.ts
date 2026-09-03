import {
  AlignLeftSimpleIcon as AlignLeftSimple,
  AlignRightSimpleIcon as AlignRightSimple,
} from "@phosphor-icons/react";

import {
  DEFAULT_SLIDE_IMAGE_COVER_SURFACE_SETTINGS,
  SlideImageCoverSurfaceSettingsSchema,
} from "../../model/templates/slide-image-cover";
import { defineSurfaceSettingsConfiguration } from "../../authoring/shared/surface-settings-configuration";

/**
 * Explicit surface configuration for the slide image cover.
 *
 * Written out for this variant instead of assembled inside the authoring
 * view registry. Behaviour delegates to the shared surface-settings
 * builders.
 */
export const slideImageCoverSurfaceConfiguration = defineSurfaceSettingsConfiguration({
  schema: SlideImageCoverSurfaceSettingsSchema,
  createInitialDraft: () => DEFAULT_SLIDE_IMAGE_COVER_SURFACE_SETTINGS,
  controls: [
    {
      kind: "image",
      mediaStorage: "url",
      positioning: "crop",
      name: "image",
      label: "Cover image",
      description: "Choose the image shown beside the cover text.",
      chooseLabel: "Choose cover image",
      changeLabel: "Replace image",
      removeLabel: "Remove image",
      emptyLabel: "Choose cover image",
      previewLabel: "Current image",
      pickerTitle: "Choose cover image",
      altLabel: "Image description",
      altPlaceholder: "Optional image description",
      placement: {
        sheet: { section: "image", order: 10 },
      },
    },
    {
      kind: "select",
      name: "imageSide",
      label: "Image side",
      description: "Choose which side of the slide the image occupies.",
      options: [
        { value: "left", label: "Left", icon: AlignLeftSimple },
        { value: "right", label: "Right", icon: AlignRightSimple },
      ],
      placement: {
        quickMenu: { presentation: "segmented", order: 40 },
      },
    },
  ],
  sections: [
    {
      id: "image",
      title: "Image",
    },
  ],
  defaultOpenSections: ["image"],
  title: "Image cover settings",
  description: "Configure the surface and image for this cover slide.",
});
