import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { categoriseConfiguration } from "@/editor/blocks/assessment/categorise/categorise-definition";
import { dropdownConfiguration } from "@/editor/blocks/assessment/dropdown/dropdown-definition";
import { dragDropConfiguration } from "@/editor/blocks/assessment/drag-drop/drag-drop-definition";
import { fillBlanksConfiguration } from "@/editor/blocks/assessment/fill-blanks/fill-blanks-definition";
import { imageHotspotConfiguration } from "@/editor/blocks/assessment/image-hotspot/image-hotspot-definition";
import { matchingConfiguration } from "@/editor/blocks/assessment/matching/matching-definition";
import { mcqConfiguration } from "@/editor/blocks/assessment/mcq/mcq-definition";
import { multiselectConfiguration } from "@/editor/blocks/assessment/multiselect/multiselect-definition";
import { quizConfiguration } from "@/editor/blocks/assessment/quiz/quiz-definition";
import { sequencingConfiguration } from "@/editor/blocks/assessment/sequencing/sequencing-definition";
import type { QuickControlDescriptor } from "@/editor/configuration/quick-menu";
import { builtInSurfaceVariantRegistry } from "../model/built-in-surface-variant-definitions";
import { applySurfaceSettings } from "./commands/surface-settings-command";

import {
  createSurfaceAuthoringViewMap,
  type SurfaceAuthoringViewBinding,
  type SurfaceAuthoringViewMap,
} from "./surface-authoring-view-registry";
import {
  builtInSurfaceAuthoringViewBindings,
  builtInSurfaceAuthoringViewMap,
} from "./surface-authoring-views";

const ASSESSMENT_SURFACE_CONFIGURATIONS = [
  {
    variantId: "slide-categorise-question",
    questionConfiguration: categoriseConfiguration,
  },
  {
    variantId: "slide-sequencing-question",
    questionConfiguration: sequencingConfiguration,
  },
  {
    variantId: "slide-matching-question",
    questionConfiguration: matchingConfiguration,
  },
  {
    variantId: "slide-image-hotspot-question",
    questionConfiguration: imageHotspotConfiguration,
  },
  {
    variantId: "slide-multiple-choice-question",
    questionConfiguration: mcqConfiguration,
  },
  {
    variantId: "slide-multiselect-question",
    questionConfiguration: multiselectConfiguration,
  },
  {
    variantId: "slide-dropdown-question",
    questionConfiguration: dropdownConfiguration,
  },
  {
    variantId: "slide-drag-drop-question",
    questionConfiguration: dragDropConfiguration,
  },
  {
    variantId: "slide-fill-blanks-question",
    questionConfiguration: fillBlanksConfiguration,
  },
  {
    variantId: "slide-quiz",
    questionConfiguration: quizConfiguration,
  },
] as const;

const ASSESSMENT_SURFACE_VARIANT_IDS: ReadonlySet<string> = new Set(
  ASSESSMENT_SURFACE_CONFIGURATIONS.map(({ variantId }) => variantId),
);

describe("surface authoring view map", () => {
  it("covers the exact built-in 28-variant set", () => {
    expect(
      builtInSurfaceVariantRegistry.definitions.filter((definition) =>
        builtInSurfaceAuthoringViewMap.get(definition.id),
      ),
    ).toHaveLength(28);
    expect(builtInSurfaceAuthoringViewBindings.map(({ variantId }) => variantId)).toEqual(
      builtInSurfaceVariantRegistry.definitions.map(({ id }) => id),
    );
  });

  it("routes ordinary built-in sheets through Surface settings and assessment tracers through combined access", () => {
    for (const definition of builtInSurfaceVariantRegistry.definitions) {
      const sheet = builtInSurfaceAuthoringViewMap.get(definition.id)?.settingsSheet;
      if (ASSESSMENT_SURFACE_VARIANT_IDS.has(definition.id)) {
        expect(sheet?.read).toEqual(expect.any(Function));
        expect(sheet?.apply).toEqual(expect.any(Function));
        expect(sheet?.apply).not.toBe(applySurfaceSettings);
        continue;
      }
      expect(sheet?.apply).toBe(applySurfaceSettings);
    }
  });

  it("rejects duplicate, missing, and extra bindings", () => {
    const bindings = builtInSurfaceAuthoringViewBindings;
    const first = bindings[0];
    expect(first).toBeDefined();
    if (!first) return;

    expect(() =>
      createSurfaceAuthoringViewMap({
        registry: builtInSurfaceVariantRegistry,
        bindings: [...bindings, first],
      }),
    ).toThrow(`Surface variant "${first.variantId}" is already bound for authoring.`);
    expect(() =>
      createSurfaceAuthoringViewMap({
        registry: builtInSurfaceVariantRegistry,
        bindings: bindings.slice(1),
      }),
    ).toThrow(`Surface variant "${first.variantId}" has no authoring view binding.`);
    expect(() =>
      createSurfaceAuthoringViewMap({
        registry: builtInSurfaceVariantRegistry,
        bindings: [...bindings, { ...first, variantId: "extra-surface" }],
      }),
    ).toThrow('Surface authoring variant "extra-surface" is not registered.');
  });

  it("owns immutable normalized binding snapshots", () => {
    const binding = builtInSurfaceAuthoringViewBindings[0];
    expect(binding).toBeDefined();
    if (!binding) return;
    const input: SurfaceAuthoringViewBinding[] = [{ ...binding }];
    const registry = {
      definitions: [builtInSurfaceVariantRegistry.definitions[0]!],
      get: (variantId: string) =>
        variantId === builtInSurfaceVariantRegistry.definitions[0]?.id
          ? builtInSurfaceVariantRegistry.definitions[0]
          : undefined,
    };
    const map = createSurfaceAuthoringViewMap({ registry, bindings: input });
    const registered = map.get(binding.variantId);

    input.splice(0);
    expect(registered).toBeDefined();
    expect(registered).not.toBe(binding);
    expect(Object.isFrozen(registered)).toBe(true);
  });

  it("snapshots nested authoring chrome facts without retaining raw configuration", () => {
    const binding = builtInSurfaceAuthoringViewBindings[0];
    const definition = builtInSurfaceVariantRegistry.definitions[0];
    expect(binding).toBeDefined();
    expect(definition).toBeDefined();
    if (!binding || !definition) return;

    const options = [{ value: "compact", label: "Compact" }];
    const defaultOpenSections = ["main"];
    const map = createSurfaceAuthoringViewMap({
      registry: {
        definitions: [definition],
        get: (variantId: string) => (variantId === definition.id ? definition : undefined),
      },
      bindings: [
        {
          variantId: definition.id,
          component: binding.component,
          configuration: {
            attr: "settings",
            schema: z.object({ mode: z.string() }),
            controls: [
              {
                kind: "select",
                name: "mode",
                label: "Mode",
                options,
                placement: {
                  quickMenu: { presentation: "segmented" },
                  sheet: { section: "main" },
                },
              },
            ],
            sheet: {
              title: "Surface settings",
              defaultOpenSections,
              sections: [{ id: "main", title: "Main" }],
            },
          },
        },
      ],
    });
    const registered = map.get(definition.id);
    if (!registered) throw new Error("Expected registered surface authoring view.");

    options[0]!.label = "Changed";
    options.push({ value: "expanded", label: "Expanded" });
    defaultOpenSections.push("advanced");

    expect("configuration" in registered).toBe(false);
    const quickControl = registered.quickMenu?.controls[0];
    const sheetField = registered.settingsSheet?.sections[0]?.items[0];
    expect(quickControl?.kind === "select" ? quickControl.options : undefined).toEqual([
      { value: "compact", label: "Compact" },
    ]);
    expect(sheetField?.kind === "select" ? sheetField.options : undefined).toEqual([
      { value: "compact", label: "Compact" },
    ]);
    expect(registered.settingsSheet?.defaultOpenSections).toEqual(["main"]);
    expect(
      Object.isFrozen(quickControl?.kind === "select" ? quickControl.options : undefined),
    ).toBe(true);
    expect(Object.isFrozen(sheetField?.kind === "select" ? sheetField.options : undefined)).toBe(
      true,
    );
    expect(Object.isFrozen(registered.settingsSheet?.defaultOpenSections)).toBe(true);
  });
});

describe("surface authoring view quick menus", () => {
  it.each(ASSESSMENT_SURFACE_CONFIGURATIONS)(
    "registers combined assessment quick controls and a Background-free drawer for $variantId",
    ({ questionConfiguration, variantId }) => {
      const expectedQuickNames = questionConfiguration.controls
        .filter((control) => control.placement?.quickMenu)
        .map(({ name }) => `question.${name}`);
      const expectedSheetNames = [
        ...questionConfiguration.controls
          .filter((control) => control.placement?.sheet)
          .map(({ name }) => `question.${name}`),
        "surface.header.enabled",
        "surface.footer.enabled",
      ];

      expect(
        resolveView(builtInSurfaceAuthoringViewMap, variantId)?.quickMenu?.controls.map(
          ({ name }) => name,
        ) ?? [],
      ).toEqual(expectedQuickNames);
      expect(getSettingsSheetFieldNames(variantId)).toEqual(expectedSheetNames);
      expect(getSettingsSheetFieldNames(variantId)).not.toContain("background");
      expect(getSettingsSheetFieldNames(variantId)).not.toContain("background.color");
    },
  );

  it("uses icons for image-side controls without adding them to the settings sheet", () => {
    const control = getQuickMenuControl("slide-image-cover", "imageSide");

    expect(control.kind).toBe("select");
    if (control.kind !== "select") return;

    expect(control.options?.every((option) => option.icon !== undefined)).toBe(true);
    expect(getSettingsSheetFieldNames("slide-image-cover")).not.toContain("imageSide");
  });

  it("uses icons for orientation while leaving proportion text-based and quick-menu-only", () => {
    const orientation = getQuickMenuControl("slide-two-columns", "orientation");
    const proportion = getQuickMenuControl("slide-two-columns", "proportion");

    expect(orientation.kind).toBe("select");
    expect(proportion.kind).toBe("select");
    if (orientation.kind !== "select" || proportion.kind !== "select") return;

    expect(orientation.options?.every((option) => option.icon !== undefined)).toBe(true);
    expect(proportion.options?.every((option) => option.icon === undefined)).toBe(true);
    expect(getSettingsSheetFieldNames("slide-two-columns")).not.toContain("orientation");
    expect(getSettingsSheetFieldNames("slide-two-columns")).not.toContain("proportion");
  });
});

function getQuickMenuControl(viewId: string, controlName: string): QuickControlDescriptor {
  const control = resolveView(builtInSurfaceAuthoringViewMap, viewId)?.quickMenu?.controls.find(
    (candidate) => candidate.name === controlName,
  );
  if (!control) {
    throw new Error(`Surface authoring view "${viewId}" has no "${controlName}" quick control.`);
  }
  return control;
}

function getSettingsSheetFieldNames(viewId: string): string[] {
  return (
    resolveView(builtInSurfaceAuthoringViewMap, viewId)?.settingsSheet?.sections.flatMap(
      (section) =>
        section.items.flatMap((item) => (item.kind === "directChildCollection" ? [] : [item.name])),
    ) ?? []
  );
}

function resolveView(map: SurfaceAuthoringViewMap, variantId: string) {
  return map.get(variantId);
}
