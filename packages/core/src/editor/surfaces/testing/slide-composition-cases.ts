import {
  isRegisteredSlideCompositionSurfaceDefinition,
  SlideCompositionKindSchema,
  type SlideCompositionKind,
  type SlideCompositionOrientation,
  type SlideCompositionProportion,
  type SlideRegionRole,
  type SurfaceImageSlotRole,
} from "../model/slide-composition-definition";
import { builtInSurfaceVariantRegistry } from "../model/built-in-surface-variant-definitions";

export type TitlePresentationState = "required" | "visible" | "hidden";
export type OrientationPresentationState = SlideCompositionOrientation;
export type ProportionPresentationState = SlideCompositionProportion;

export interface CompositionStateCase {
  readonly variant: string;
  readonly composition: SlideCompositionKind;
  readonly title: TitlePresentationState;
  readonly orientation?: OrientationPresentationState;
  readonly proportion?: ProportionPresentationState;
  readonly regions: readonly SlideRegionRole[];
  readonly images: readonly SurfaceImageSlotRole[];
}

export function expandSlideCompositionCases(): readonly CompositionStateCase[] {
  const definitions = builtInSurfaceVariantRegistry.definitions.filter(
    isRegisteredSlideCompositionSurfaceDefinition,
  );
  assertCompositionRegistrationIsExhaustive(
    definitions.map(({ slideComposition }) => slideComposition.id),
  );

  return Object.freeze(
    definitions.flatMap((definition) => {
      const titleStates: readonly TitlePresentationState[] =
        definition.slideComposition.title === "required" ? ["required"] : ["visible", "hidden"];
      const orientationStates: readonly (OrientationPresentationState | undefined)[] = definition
        .slideComposition.orientation?.options ?? [undefined];
      const proportionStates: readonly (ProportionPresentationState | undefined)[] = definition
        .slideComposition.proportion?.options ?? [undefined];

      return titleStates.flatMap((title) =>
        orientationStates.flatMap((orientation) =>
          proportionStates.map((proportion) => {
            const state: CompositionStateCase = Object.freeze({
              variant: definition.id,
              composition: definition.slideComposition.id,
              title,
              ...(orientation === undefined ? {} : { orientation }),
              ...(proportion === undefined ? {} : { proportion }),
              regions: definition.slideComposition.regions,
              images: definition.slideComposition.imageSlots,
            });
            const surface = definition.createSurface({
              surfaceId: `geometry-${definition.slideComposition.id}`,
            });
            const baseSettings = surface.attrs?.["settings"];
            const candidateSettings = {
              ...(isRecord(baseSettings) ? baseSettings : {}),
              ...(title === "required" ? {} : { slideTitle: { enabled: title === "visible" } }),
              ...(orientation === undefined ? {} : { orientation }),
              ...(proportion === undefined ? {} : { proportion }),
            };
            const parsed = definition.settingsSchema.safeParse(candidateSettings);
            if (!parsed.success) {
              throw new Error(
                `Generated composition settings are invalid for variant "${definition.id}" ` +
                  `(${definition.slideComposition.id}, title=${title}, ` +
                  `orientation=${orientation ?? "none"}, proportion=${proportion ?? "none"}).`,
              );
            }
            return state;
          }),
        ),
      );
    }),
  );
}

function assertCompositionRegistrationIsExhaustive(
  registeredCompositions: readonly SlideCompositionKind[],
): void {
  const registered = new Set(registeredCompositions);
  const expected = new Set(SlideCompositionKindSchema.options);
  const missing = SlideCompositionKindSchema.options.filter(
    (composition) => !registered.has(composition),
  );
  const extra = registeredCompositions.filter((composition) => !expected.has(composition));
  const duplicates = registeredCompositions.filter(
    (composition, index) => registeredCompositions.indexOf(composition) !== index,
  );

  if (missing.length > 0 || extra.length > 0 || duplicates.length > 0) {
    throw new Error(
      `Slide composition registration mismatch: missing=[${missing.join(", ")}], ` +
        `extra=[${extra.join(", ")}], duplicates=[${duplicates.join(", ")}].`,
    );
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
