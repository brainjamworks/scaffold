import { describe, expect, it } from "vite-plus/test";

import { createThemeCatalogue, type ScaffoldColorMode } from "@/theme/model";

import { COURSE_THEME_PALETTE_SLOTS, courseThemeFormDefinition } from "./theme-settings-form";

describe("courseThemeFormDefinition colour choices", () => {
  it.each<ScaffoldColorMode>(["light", "dark"])(
    "populates every semantic field from the selected preset's %s author palette",
    (mode) => {
      const catalogue = createThemeCatalogue();
      const preset = catalogue.presets.find(({ id }) => id === "scaffold-editorial")!;
      const palette =
        mode === "light"
          ? preset.values.colors.author.light
          : preset.values.colors.author.dark.values;
      const expectedValues = [...new Set(COURSE_THEME_PALETTE_SLOTS.map((slot) => palette[slot]))];
      const definition = courseThemeFormDefinition({
        catalogue,
        editable: true,
        mode,
        preset,
        resetThemeEnabled: true,
        values: preset.values,
      });
      const colourFields = definition.sections
        .flatMap(({ items }) => items)
        .filter((item) => item.kind === "color");

      expect(colourFields).toHaveLength(11);
      for (const field of colourFields) {
        expect(field.palette.map(({ value }) => value)).toEqual(expectedValues);
      }
    },
  );

  it("uses user-facing automatic wording for derived dark colours", () => {
    const catalogue = createThemeCatalogue();
    const preset = catalogue.defaultPreset;
    const definition = courseThemeFormDefinition({
      catalogue,
      editable: true,
      mode: "dark",
      preset,
      resetThemeEnabled: true,
      values: preset.values,
    });
    const primary = definition.sections
      .flatMap(({ items }) => items)
      .find((item) => item.kind === "color" && item.name === "primary");

    expect(primary).toMatchObject({
      resetLabel: "Use automatic colour",
      resetAriaLabel: "Use automatic primary colour",
      status: { label: "Automatic" },
    });
    expect(definition.footerActions).toContainEqual(
      expect.objectContaining({ id: "derive-dark", label: "Use automatic dark colours" }),
    );
  });
});
