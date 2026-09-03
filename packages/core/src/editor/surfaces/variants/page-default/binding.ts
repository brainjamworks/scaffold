import { defineSurfaceSettingsConfiguration } from "../../authoring/shared/surface-settings-configuration";

/**
 * Explicit surface configuration for the default page surface.
 *
 * Written out for this variant instead of assembled inside the authoring
 * view registry. Behaviour delegates to the shared surface-settings
 * builders.
 */
export const pageDefaultSurfaceConfiguration = defineSurfaceSettingsConfiguration();
