import { z } from "zod";
import {
  CourseThemeAuthorPaletteSchema,
  CourseThemeColorPaletteSchema,
} from "@scaffold/contracts";

import { CourseThemeValuesSchema } from "@/schemas/course-document";

const DefinitionIdSchema = z.string().trim().min(1).max(200);
const DefinitionTextSchema = z.string().trim().min(1).max(500);

export const CourseThemeFontWeightSchema = z.union([
  z.literal(400),
  z.literal(500),
  z.literal(600),
  z.literal(700),
  z.literal(800),
]);

const CourseThemeSupplementalDataSchema = z.tuple([
  CourseThemeAuthorPaletteSchema.shape.primary,
  CourseThemeAuthorPaletteSchema.shape.primary,
]);

export const CourseThemePaletteRecipeSchema = z
  .object({
    id: DefinitionIdSchema,
    version: z.literal(1),
    defaults: z
      .object({
        light: CourseThemeAuthorPaletteSchema,
        dark: CourseThemeAuthorPaletteSchema,
      })
      .strict(),
    semanticBase: z
      .object({
        light: CourseThemeColorPaletteSchema,
        dark: CourseThemeColorPaletteSchema,
      })
      .strict(),
    data: z
      .object({
        lightSupplemental: CourseThemeSupplementalDataSchema,
        darkSupplemental: CourseThemeSupplementalDataSchema,
      })
      .strict(),
  })
  .strict();

export const CourseThemePresetDefinitionSchema = z
  .object({
    id: DefinitionIdSchema,
    revision: DefinitionIdSchema,
    label: DefinitionTextSchema,
    description: DefinitionTextSchema,
    recipe: CourseThemePaletteRecipeSchema,
    values: CourseThemeValuesSchema,
  })
  .strict()
  .superRefine((preset, context) => {
    if (
      preset.recipe.id !== preset.values.colors.recipe.id ||
      preset.recipe.version !== preset.values.colors.recipe.version
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Preset recipe must match materialised recipe provenance",
        path: ["values", "colors", "recipe"],
      });
    }
  });

export const CourseThemeFontDefinitionSchema = z
  .object({
    id: DefinitionIdSchema,
    label: DefinitionTextSchema,
    category: z.enum(["sans", "serif", "mono"]),
    family: DefinitionTextSchema,
    fallback: DefinitionTextSchema,
    weights: z.array(CourseThemeFontWeightSchema).min(1),
  })
  .strict();

export const ScaffoldThemeExtensionSchema = z
  .object({
    presets: z.array(CourseThemePresetDefinitionSchema).optional(),
    fonts: z.array(CourseThemeFontDefinitionSchema).optional(),
  })
  .strict();

export type CourseThemeFontWeight = z.infer<typeof CourseThemeFontWeightSchema>;
export type CourseThemePaletteRecipeDefinition = z.infer<typeof CourseThemePaletteRecipeSchema>;
export type CourseThemePresetDefinition = z.infer<typeof CourseThemePresetDefinitionSchema>;
export type CourseThemeFontDefinition = z.infer<typeof CourseThemeFontDefinitionSchema>;
export type ScaffoldThemeExtension = z.infer<typeof ScaffoldThemeExtensionSchema>;
