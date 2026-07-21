import type { RegisteredSlideCompositionSurfaceDefinition } from "../../model/slide-composition-definition";

export function slideCompositionDataAttrs(
  definition: RegisteredSlideCompositionSurfaceDefinition,
  settings: unknown,
): Record<string, string | undefined> {
  const parsed = definition.settingsSchema.parse(settings) as Record<string, unknown>;
  const slideTitle = parsed["slideTitle"] as { enabled?: unknown } | undefined;

  return {
    "data-slide-layout-variant": definition.id,
    "data-slide-layout-composition": definition.slideComposition.id,
    "data-slide-layout-title":
      definition.slideComposition.title === "required"
        ? "required"
        : slideTitle?.enabled === true
          ? "visible"
          : "hidden",
    "data-slide-layout-regions": definition.slideComposition.regions.join(" "),
    "data-slide-layout-orientation": definition.slideComposition.orientation
      ? String(parsed["orientation"])
      : undefined,
    "data-slide-layout-proportion": definition.slideComposition.proportion
      ? String(parsed["proportion"])
      : undefined,
  };
}
