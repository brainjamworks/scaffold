import { defineSurfaceSettingsConfiguration } from "../../authoring/shared/surface-settings-configuration";

/**
 * Explicit surface configuration for the slide cover.
 *
 * Written out for this variant instead of assembled inside the authoring
 * view registry. Behaviour delegates to the shared surface-settings
 * builders.
 */
export const slideCoverSurfaceConfiguration = defineSurfaceSettingsConfiguration({
  title: "Slide settings",
  description: "Configure presentation settings for this slide.",
});
