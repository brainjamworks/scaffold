import {
  SurfaceSettingsSchema,
  type SurfaceBackground,
  type SurfaceSettings,
  VerticalContentPositionSchema,
  type VerticalContentPosition,
} from "@/schemas/course-document";

import type { SurfaceVariantDefinition } from "./surface-variant-definition";

export const DEFAULT_SURFACE_REGION_TOGGLE = { enabled: false } as const;

export const DEFAULT_SURFACE_SETTINGS = {
  header: DEFAULT_SURFACE_REGION_TOGGLE,
  footer: DEFAULT_SURFACE_REGION_TOGGLE,
} as const satisfies SurfaceSettings;

export function readSurfaceSettings(value: unknown): SurfaceSettings {
  const parsed = SurfaceSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function readSurfaceVerticalPosition(
  value: unknown,
  definition: SurfaceVariantDefinition | undefined,
): VerticalContentPosition | null {
  const capability = definition?.alignment?.verticalContentPosition;
  if (!capability) return null;

  const parsed = VerticalContentPositionSchema.safeParse(
    readSurfaceSettings(value).verticalPosition,
  );
  return parsed.success ? parsed.data : capability.default;
}

export function readSurfaceBackground(value: unknown): SurfaceBackground | null {
  const settings = readSurfaceSettings(value);
  return settings.background ?? null;
}

export function readSurfaceRegionEnabled(value: unknown, region: "header" | "footer"): boolean {
  const settings = readSurfaceSettings(value);
  const regionSettings = settings[region];
  if (
    typeof regionSettings === "object" &&
    regionSettings !== null &&
    !Array.isArray(regionSettings) &&
    "enabled" in regionSettings
  ) {
    return regionSettings.enabled === true;
  }

  return false;
}

export function surfaceRegionDataAttrs(value: unknown): {
  "data-surface-header": "on" | "off";
  "data-surface-footer": "on" | "off";
} {
  return {
    "data-surface-header": readSurfaceRegionEnabled(value, "header") ? "on" : "off",
    "data-surface-footer": readSurfaceRegionEnabled(value, "footer") ? "on" : "off",
  };
}
