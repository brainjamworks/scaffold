import {
  DEFAULT_SLIDE_IMAGE_BAND_SURFACE_SETTINGS,
  SlideImageBandSurfaceSettingsSchema,
} from "../../model/templates/slide-image-band";
import { defineSurfaceSettingsConfiguration } from "../../authoring/shared/surface-settings-configuration";

/**
 * Explicit surface configuration for the slide image band.
 *
 * Written out for this variant instead of assembled inside the authoring
 * view registry. Behaviour delegates to the shared surface-settings
 * builders.
 */
export const slideImageBandSurfaceConfiguration = defineSurfaceSettingsConfiguration({
  schema: SlideImageBandSurfaceSettingsSchema,
  createInitialDraft: () => DEFAULT_SLIDE_IMAGE_BAND_SURFACE_SETTINGS,
  controls: [
    {
      kind: "image",
      mediaStorage: "url",
      positioning: "crop",
      name: "image",
      label: "Band image",
      description: "Choose the image shown across the top of the slide.",
      chooseLabel: "Choose band image",
      changeLabel: "Replace image",
      removeLabel: "Remove image",
      emptyLabel: "Choose band image",
      previewLabel: "Current image",
      pickerTitle: "Choose band image",
      altLabel: "Image description",
      altPlaceholder: "Optional image description",
      placement: {
        sheet: { section: "image", order: 10 },
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
  title: "Image band settings",
  description: "Configure the surface and image for this cover slide.",
});
