import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

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

describe("surface authoring view map", () => {
  it("covers the exact built-in 18-variant set", () => {
    expect(
      builtInSurfaceVariantRegistry.definitions.filter((definition) =>
        builtInSurfaceAuthoringViewMap.get(definition.id),
      ),
    ).toHaveLength(18);
    expect(builtInSurfaceAuthoringViewBindings.map(({ variantId }) => variantId)).toEqual(
      builtInSurfaceVariantRegistry.definitions.map(({ id }) => id),
    );
  });

  it("routes every built-in settings sheet through the authoring surface adapter", () => {
    for (const definition of builtInSurfaceVariantRegistry.definitions) {
      expect(builtInSurfaceAuthoringViewMap.get(definition.id)?.settingsSheet?.apply).toBe(
        applySurfaceSettings,
      );
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
    ).toThrow(/already bound/i);
    expect(() =>
      createSurfaceAuthoringViewMap({
        registry: builtInSurfaceVariantRegistry,
        bindings: bindings.slice(1),
      }),
    ).toThrow(/has no authoring view binding/i);
    expect(() =>
      createSurfaceAuthoringViewMap({
        registry: builtInSurfaceVariantRegistry,
        bindings: [...bindings, { ...first, variantId: "extra-surface" }],
      }),
    ).toThrow(/is not registered/i);
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
    const sheetField = registered.settingsSheet?.sections[0]?.fields[0];
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
      (section) => section.fields.map((field) => field.name),
    ) ?? []
  );
}

function resolveView(map: SurfaceAuthoringViewMap, variantId: string) {
  return map.get(variantId);
}
