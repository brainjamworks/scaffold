import { PaletteIcon as Palette } from "@phosphor-icons/react";
import type { CourseThemeRef } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";

import type {
  SettingsFormAction,
  SettingsFormActionEvent,
  SettingsFormDefinition,
  SettingsSheetBooleanFieldDescriptor,
  SettingsSheetSelectFieldDescriptor,
  SettingsSheetSelectOption,
} from "@/editor/configuration/settings-sheet";
import { SettingsForm, SettingsFormFooter } from "@/editor/shell/settings/forms/SettingsForm";
import { PersistedCourseThemeSchema, type PersistedCourseTheme } from "@/schemas/course-document";
import type { CourseColourSystemRegistry } from "@/theme/course/colour-systems/registry";
import type {
  CourseDesignThemeRegistry,
  CourseDesignThemeRevision,
} from "@/theme/course/designs/registry";
import { builtInThemeFonts } from "@/theme/model/built-in-fonts";
import { Button } from "@/ui/components/Button/Button";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { Sheet } from "@/ui/components/Sheet/Sheet";
import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import { iconSm } from "@/ui/tokens/icon-sizes";

import {
  resetCourseTheme,
  resetCourseThemeOverride,
  resetCourseThemeOverrideSection,
  selectCourseColourSystem,
  selectCourseDesign,
  setCourseDesignOverride,
  setCourseTypographyOverride,
} from "./course-theme-commands";
import "./CourseThemePanel.css";

interface CourseThemeFormValues {
  design: string;
  colourSystem: string;
  defaultFontId: string;
  headingFontId: string;
  codeFontId: string;
  bodyWeight: string;
  headingWeight: string;
  courseTextSize: string;
  bodyLineSpacing: string;
  headingLineSpacing: string;
  headingLetterSpacing: string;
  uppercaseHeadings: boolean;
  roundness: string;
  stroke: string;
  shadow: string;
  density: string;
}

type CourseThemeActionId = "reset-theme" | "reset-typography" | "reset-design";
type CourseTypographyField =
  | "defaultFontId"
  | "headingFontId"
  | "codeFontId"
  | "bodyWeight"
  | "headingWeight"
  | "courseTextSize"
  | "bodyLineSpacing"
  | "headingLineSpacing"
  | "headingLetterSpacing"
  | "uppercaseHeadings";
type CourseDesignField = "roundness" | "stroke" | "shadow" | "density";

export interface CourseThemePanelProps {
  editor: Editor | null;
  designs: CourseDesignThemeRegistry;
  colourSystems: CourseColourSystemRegistry;
  theme: PersistedCourseTheme;
  onThemeChange: (theme: PersistedCourseTheme) => void;
}

export function CourseThemePanel({
  editor,
  designs,
  colourSystems,
  theme,
  onThemeChange,
}: CourseThemePanelProps) {
  const designAvailable = Boolean(designs.get(theme.design));
  const colourSystemAvailable = Boolean(colourSystems.get(theme.colourSystem));
  const designValue = designAvailable ? referenceValue(theme.design) : "";
  const colourSystemValue = colourSystemAvailable ? referenceValue(theme.colourSystem) : "";
  const selectedDesign = designs.get(theme.design);
  const formValues = courseThemeFormValues(theme, selectedDesign, designValue, colourSystemValue);
  const form = useForm<CourseThemeFormValues>({
    defaultValues: formValues,
  });

  const resetTypographyField = useCallback(
    (field: CourseTypographyField) => {
      if (!editor || !resetCourseThemeOverride(editor, "typography", field, designs)) return;
      const nextTheme = readEditorTheme(editor);
      if (nextTheme) onThemeChange(nextTheme);
    },
    [designs, editor, onThemeChange],
  );
  const resetDesignField = useCallback(
    (field: CourseDesignField) => {
      if (!editor || !resetCourseThemeOverride(editor, "design", field, designs)) return;
      notifyThemeChange(editor, onThemeChange);
    },
    [designs, editor, onThemeChange],
  );

  const definition = useMemo(
    () =>
      courseThemeFormDefinition({
        designs,
        colourSystems,
        editable: Boolean(editor),
        selectedDesign,
        theme,
        onResetTypography: resetTypographyField,
        onResetDesign: resetDesignField,
      }),
    [colourSystems, designs, editor, resetDesignField, resetTypographyField, selectedDesign, theme],
  );
  const footerActions: readonly SettingsFormAction<CourseThemeActionId>[] = [
    {
      id: "reset-theme",
      label: "Reset theme",
      ariaLabel: "Reset complete theme",
      disabled: !editor,
    },
  ];

  useEffect(() => {
    const current = form.getValues();
    if (!courseThemeFormValuesEqual(current, formValues)) {
      form.reset(formValues);
    }
  }, [form, formValues]);

  useEffect(() => {
    const subscription = form.watch((draft, { name, type }) => {
      if (type !== "change" || !name) return;

      if (name === "design" || name === "colourSystem") {
        const savedValue = name === "design" ? designValue : colourSystemValue;
        const reference = parseReference(draft[name]);
        if (!editor || !reference) {
          queueMicrotask(() => form.setValue(name, savedValue));
          return;
        }

        const changed =
          name === "design"
            ? Boolean(designs.get(reference)) &&
              selectCourseDesign(editor, reference, designs, colourSystems)
            : Boolean(colourSystems.get(reference)) &&
              selectCourseColourSystem(editor, reference, colourSystems);
        if (!changed) {
          queueMicrotask(() => form.setValue(name, savedValue));
          return;
        }

        notifyThemeChange(editor, onThemeChange);
        return;
      }

      if (!isCourseTypographyField(name) && !isCourseDesignField(name)) return;
      const savedValue = formValues[name];
      if (!editor) {
        queueMicrotask(() => form.setValue(name, savedValue));
        return;
      }

      const changed = isCourseTypographyField(name)
        ? setCourseTypographyFormValue(editor, name, draft[name], designs)
        : setCourseDesignFormValue(editor, name, draft[name], designs);
      if (!changed) {
        queueMicrotask(() => form.setValue(name, savedValue));
        return;
      }

      notifyThemeChange(editor, onThemeChange);
    });

    return subscription.unsubscribe;
  }, [
    colourSystemValue,
    colourSystems,
    designValue,
    designs,
    editor,
    form,
    formValues,
    onThemeChange,
  ]);

  const handleAction = ({ actionId }: SettingsFormActionEvent<CourseThemeActionId>) => {
    if (!editor) return;
    const changed =
      actionId === "reset-theme"
        ? resetCourseTheme(editor)
        : actionId === "reset-typography"
          ? resetCourseThemeOverrideSection(editor, "typography", designs)
          : actionId === "reset-design"
            ? resetCourseThemeOverrideSection(editor, "design", designs)
            : false;
    if (changed) notifyThemeChange(editor, onThemeChange);
  };

  return (
    <Sheet.Root>
      <Tooltip.Provider delayDuration={350}>
        <Tooltip.Root>
          <Sheet.Trigger asChild>
            <Tooltip.Trigger asChild>
              <IconButton
                variant="ghost"
                size="lg"
                aria-label="Open course theme"
                disabled={!editor}
              >
                <Palette size={iconSm} aria-hidden />
              </IconButton>
            </Tooltip.Trigger>
          </Sheet.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content side="bottom" sideOffset={8}>
              Course theme
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
      <Sheet.Content side="right" className="sc-course-theme-panel">
        <Sheet.Header closeLabel="Close course theme">
          <Sheet.Title>Course theme</Sheet.Title>
          <Sheet.Description>
            Choose a complete Course design and colour system for learner-facing content.
          </Sheet.Description>
        </Sheet.Header>
        <Sheet.Body>
          {!designAvailable || !colourSystemAvailable ? (
            <div className="sc-course-theme-panel-status" role="status">
              {!designAvailable ? (
                <p>Saved design {formatReference(theme.design)} is unavailable.</p>
              ) : null}
              {!colourSystemAvailable ? (
                <p>Saved colour system {formatReference(theme.colourSystem)} is unavailable.</p>
              ) : null}
            </div>
          ) : null}

          <SettingsForm definition={definition} form={form} onAction={handleAction} />
        </Sheet.Body>
        <SettingsFormFooter actions={footerActions} onAction={handleAction} />
      </Sheet.Content>
    </Sheet.Root>
  );
}

function courseThemeFormDefinition({
  designs,
  colourSystems,
  editable,
  selectedDesign,
  theme,
  onResetTypography,
  onResetDesign,
}: {
  designs: CourseDesignThemeRegistry;
  colourSystems: CourseColourSystemRegistry;
  editable: boolean;
  selectedDesign: CourseDesignThemeRevision | undefined;
  theme: PersistedCourseTheme;
  onResetTypography: (field: CourseTypographyField) => void;
  onResetDesign: (field: CourseDesignField) => void;
}): SettingsFormDefinition<CourseThemeActionId> {
  const disabled = editable
    ? {}
    : { disabledReason: "A live editor is required to change the Course theme." };

  return {
    defaultOpenSections: ["design", "colour-system", "typography"],
    sections: [
      {
        id: "design",
        title: "Design",
        description: "Choose the complete visual character of the Course UI.",
        items: [
          {
            kind: "select",
            name: "design",
            label: "Course design",
            presentation: "cards",
            options: designs.definitions.map((definition) =>
              selectionOption(definition, `Use ${definition.label} design`),
            ),
            ...disabled,
          },
          ...designFields({
            editable,
            selectedDesign,
            theme,
            onResetDesign,
          }),
        ],
        actions: [
          {
            id: "reset-design",
            label: "Reset Design overrides",
            ariaLabel: "Reset all Design overrides",
            disabled: !editable || !selectedDesign || !theme.overrides.design,
          },
        ],
      },
      {
        id: "colour-system",
        title: "Colour system",
        description: "Choose a complete curated colour system for the Course UI.",
        items: [
          {
            kind: "select",
            name: "colourSystem",
            label: "Course colour system",
            presentation: "cards",
            options: colourSystems.definitions.map((definition) =>
              selectionOption(definition, `Use ${definition.label} colour system`),
            ),
            ...disabled,
          },
        ],
      },
      {
        id: "typography",
        title: "Typography",
        description:
          "Choose the type, spacing and casing used throughout learner-facing Course content.",
        items: typographyFields({
          editable,
          selectedDesign,
          theme,
          onResetTypography,
        }),
        actions: [
          {
            id: "reset-typography",
            label: "Reset typography",
            ariaLabel: "Reset all typography overrides",
            disabled: !editable || !selectedDesign || !theme.overrides.typography,
          },
        ],
      },
    ],
  };
}

function typographyFields({
  editable,
  selectedDesign,
  theme,
  onResetTypography,
}: {
  editable: boolean;
  selectedDesign: CourseDesignThemeRevision | undefined;
  theme: PersistedCourseTheme;
  onResetTypography: (field: CourseTypographyField) => void;
}): SettingsFormDefinition["sections"][number]["items"] {
  const textFonts = builtInThemeFonts
    .filter((font) => font.category !== "mono")
    .map((font) => ({ value: font.id, label: font.label }));
  const codeFonts = builtInThemeFonts
    .filter((font) => font.category === "mono")
    .map((font) => ({ value: font.id, label: font.label }));
  const bodyWeights = [400, 500, 600].map(weightOption);
  const headingWeights = [400, 500, 600, 700, 800].map(weightOption);

  return [
    typographySelect("defaultFontId", "Body font", textFonts),
    typographySelect("headingFontId", "Heading font", textFonts),
    typographySelect("codeFontId", "Code font", codeFonts),
    typographySelect("bodyWeight", "Body weight", bodyWeights),
    typographySelect("headingWeight", "Heading weight", headingWeights),
    typographySelect("courseTextSize", "Course text size", [
      { value: "smaller", label: "Smaller" },
      { value: "standard", label: "Standard" },
      { value: "larger", label: "Larger" },
    ]),
    typographySelect("bodyLineSpacing", "Body line spacing", [
      { value: "tight", label: "Tight" },
      { value: "standard", label: "Standard" },
      { value: "relaxed", label: "Relaxed" },
    ]),
    typographySelect("headingLineSpacing", "Heading line spacing", [
      { value: "tight", label: "Tight" },
      { value: "standard", label: "Standard" },
      { value: "relaxed", label: "Relaxed" },
    ]),
    typographySelect("headingLetterSpacing", "Heading letter spacing", [
      { value: "tight", label: "Tight" },
      { value: "standard", label: "Standard" },
      { value: "wide", label: "Wide" },
    ]),
    typographyBoolean("uppercaseHeadings", "Uppercase headings"),
  ];

  function typographySelect(
    field: CourseTypographyField,
    label: string,
    options: readonly SettingsSheetSelectOption[],
  ): SettingsSheetSelectFieldDescriptor {
    return {
      kind: "select" as const,
      name: field,
      label,
      options,
      ...courseThemeFieldPresentation({
        editable,
        selectedDesign,
        theme,
        section: "typography",
        field,
        label,
        onReset: () => onResetTypography(field),
      }),
    };
  }

  function typographyBoolean(
    field: CourseTypographyField,
    label: string,
  ): SettingsSheetBooleanFieldDescriptor {
    return {
      kind: "boolean",
      name: field,
      label,
      presentation: "checkbox",
      ...courseThemeFieldPresentation({
        editable,
        selectedDesign,
        theme,
        section: "typography",
        field,
        label,
        detail:
          "This changes visual casing only; stored text and accessible wording stay unchanged.",
        onReset: () => onResetTypography(field),
      }),
    };
  }
}

function designFields({
  editable,
  selectedDesign,
  theme,
  onResetDesign,
}: {
  editable: boolean;
  selectedDesign: CourseDesignThemeRevision | undefined;
  theme: PersistedCourseTheme;
  onResetDesign: (field: CourseDesignField) => void;
}): readonly SettingsSheetSelectFieldDescriptor[] {
  return [
    designSelect("roundness", "Roundness", [
      { value: "square", label: "Square" },
      { value: "subtle", label: "Subtle" },
      { value: "rounded", label: "Rounded" },
      { value: "full", label: "Full" },
    ]),
    designSelect("stroke", "Stroke", [
      { value: "light", label: "Light" },
      { value: "standard", label: "Standard" },
      { value: "strong", label: "Strong" },
    ]),
    designSelect("shadow", "Shadow", [
      { value: "none", label: "None" },
      { value: "soft", label: "Soft" },
      { value: "defined", label: "Defined" },
    ]),
    designSelect("density", "Density", [
      { value: "compact", label: "Compact" },
      { value: "comfortable", label: "Comfortable" },
      { value: "spacious", label: "Spacious" },
    ]),
  ];

  function designSelect(
    field: CourseDesignField,
    label: string,
    options: readonly SettingsSheetSelectOption[],
  ): SettingsSheetSelectFieldDescriptor {
    return {
      kind: "select",
      name: field,
      label,
      options,
      ...courseThemeFieldPresentation({
        editable,
        selectedDesign,
        theme,
        section: "design",
        field,
        label,
        onReset: () => onResetDesign(field),
      }),
    };
  }
}

function courseThemeFieldPresentation({
  editable,
  selectedDesign,
  theme,
  section,
  field,
  label,
  detail,
  onReset,
}: {
  editable: boolean;
  selectedDesign: CourseDesignThemeRevision | undefined;
  theme: PersistedCourseTheme;
  section: "typography" | "design";
  field: CourseTypographyField | CourseDesignField;
  label: string;
  detail?: string;
  onReset: () => void;
}) {
  const customized = Object.hasOwn(theme.overrides[section] ?? {}, field);
  const unavailableReason = !selectedDesign
    ? `The saved Course design is unavailable, so its inherited ${section} cannot be resolved.`
    : undefined;
  return {
    status: {
      label: customized ? "Custom" : "Inherited",
      variant: customized ? ("info" as const) : ("neutral" as const),
    },
    description: (
      <span className="sc-course-theme-field-help">
        <span>
          {detail ? `${detail} ` : null}
          {customized ? "Overrides the selected design." : "Inherited from the selected design."}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Use inherited ${label.toLowerCase()}`}
          disabled={!editable || !selectedDesign || !customized}
          onClick={onReset}
        >
          Use inherited
        </Button>
      </span>
    ),
    ...(!editable
      ? { disabledReason: "A live editor is required to change the Course theme." }
      : unavailableReason
        ? { disabledReason: unavailableReason }
        : {}),
  };
}

function weightOption(weight: number): SettingsSheetSelectOption {
  return { value: String(weight), label: String(weight) };
}

function courseThemeFormValues(
  theme: PersistedCourseTheme,
  design: CourseDesignThemeRevision | undefined,
  designValue: string,
  colourSystemValue: string,
): CourseThemeFormValues {
  const typography = theme.overrides.typography;
  const designOverrides = theme.overrides.design;
  const typographyDefaults = design?.authorDefaults.typography;
  const designDefaults = design?.authorDefaults.design;
  return {
    design: designValue,
    colourSystem: colourSystemValue,
    defaultFontId: typography?.defaultFontId ?? typographyDefaults?.defaultFontId ?? "",
    headingFontId: typography?.headingFontId ?? typographyDefaults?.headingFontId ?? "",
    codeFontId: typography?.codeFontId ?? typographyDefaults?.codeFontId ?? "",
    bodyWeight: String(typography?.bodyWeight ?? typographyDefaults?.bodyWeight ?? ""),
    headingWeight: String(typography?.headingWeight ?? typographyDefaults?.headingWeight ?? ""),
    courseTextSize: typography?.courseTextSize ?? typographyDefaults?.courseTextSize ?? "",
    bodyLineSpacing: typography?.bodyLineSpacing ?? typographyDefaults?.bodyLineSpacing ?? "",
    headingLineSpacing:
      typography?.headingLineSpacing ?? typographyDefaults?.headingLineSpacing ?? "",
    headingLetterSpacing:
      typography?.headingLetterSpacing ?? typographyDefaults?.headingLetterSpacing ?? "",
    uppercaseHeadings:
      typography?.uppercaseHeadings ?? typographyDefaults?.uppercaseHeadings ?? false,
    roundness: designOverrides?.roundness ?? designDefaults?.roundness ?? "",
    stroke: designOverrides?.stroke ?? designDefaults?.stroke ?? "",
    shadow: designOverrides?.shadow ?? designDefaults?.shadow ?? "",
    density: designOverrides?.density ?? designDefaults?.density ?? "",
  };
}

function courseThemeFormValuesEqual(
  left: CourseThemeFormValues,
  right: CourseThemeFormValues,
): boolean {
  return (Object.keys(right) as (keyof CourseThemeFormValues)[]).every(
    (field) => left[field] === right[field],
  );
}

function isCourseTypographyField(name: string): name is CourseTypographyField {
  return (
    name === "defaultFontId" ||
    name === "headingFontId" ||
    name === "codeFontId" ||
    name === "bodyWeight" ||
    name === "headingWeight" ||
    name === "courseTextSize" ||
    name === "bodyLineSpacing" ||
    name === "headingLineSpacing" ||
    name === "headingLetterSpacing" ||
    name === "uppercaseHeadings"
  );
}

function isCourseDesignField(name: string): name is CourseDesignField {
  return name === "roundness" || name === "stroke" || name === "shadow" || name === "density";
}

function setCourseTypographyFormValue(
  editor: Editor,
  field: CourseTypographyField,
  value: unknown,
  designs: CourseDesignThemeRegistry,
): boolean {
  switch (field) {
    case "defaultFontId":
    case "headingFontId":
    case "codeFontId":
      return typeof value === "string"
        ? setCourseTypographyOverride(editor, field, value, designs)
        : false;
    case "bodyWeight":
      return value === "400" || value === "500" || value === "600"
        ? setCourseTypographyOverride(editor, field, Number(value) as 400 | 500 | 600, designs)
        : false;
    case "headingWeight":
      return value === "400" ||
        value === "500" ||
        value === "600" ||
        value === "700" ||
        value === "800"
        ? setCourseTypographyOverride(
            editor,
            field,
            Number(value) as 400 | 500 | 600 | 700 | 800,
            designs,
          )
        : false;
    case "courseTextSize":
      return value === "smaller" || value === "standard" || value === "larger"
        ? setCourseTypographyOverride(editor, field, value, designs)
        : false;
    case "bodyLineSpacing":
    case "headingLineSpacing":
      return value === "tight" || value === "standard" || value === "relaxed"
        ? setCourseTypographyOverride(editor, field, value, designs)
        : false;
    case "headingLetterSpacing":
      return value === "tight" || value === "standard" || value === "wide"
        ? setCourseTypographyOverride(editor, field, value, designs)
        : false;
    case "uppercaseHeadings":
      return typeof value === "boolean"
        ? setCourseTypographyOverride(editor, field, value, designs)
        : false;
  }
}

function setCourseDesignFormValue(
  editor: Editor,
  field: CourseDesignField,
  value: unknown,
  designs: CourseDesignThemeRegistry,
): boolean {
  switch (field) {
    case "roundness":
      return value === "square" || value === "subtle" || value === "rounded" || value === "full"
        ? setCourseDesignOverride(editor, field, value, designs)
        : false;
    case "stroke":
      return value === "light" || value === "standard" || value === "strong"
        ? setCourseDesignOverride(editor, field, value, designs)
        : false;
    case "shadow":
      return value === "none" || value === "soft" || value === "defined"
        ? setCourseDesignOverride(editor, field, value, designs)
        : false;
    case "density":
      return value === "compact" || value === "comfortable" || value === "spacious"
        ? setCourseDesignOverride(editor, field, value, designs)
        : false;
  }
}

function notifyThemeChange(
  editor: Editor,
  onThemeChange: (theme: PersistedCourseTheme) => void,
): void {
  const nextTheme = readEditorTheme(editor);
  if (nextTheme) onThemeChange(nextTheme);
}

function selectionOption(
  definition: { id: string; revision: string; label: string; description: string },
  ariaLabel: string,
): SettingsSheetSelectOption {
  return {
    value: referenceValue(definition),
    label: definition.label,
    description: definition.description,
    ariaLabel,
  };
}

function referenceValue(reference: CourseThemeRef): string {
  return JSON.stringify([reference.id, reference.revision]);
}

function parseReference(value: unknown): CourseThemeRef | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string"
    ) {
      return null;
    }
    return { id: parsed[0], revision: parsed[1] };
  } catch {
    return null;
  }
}

function formatReference(reference: CourseThemeRef): string {
  return `${reference.id}@${reference.revision}`;
}

function readEditorTheme(editor: Editor): PersistedCourseTheme | null {
  const courseDocument = editor.state.doc.firstChild;
  if (courseDocument?.type.name !== "courseDocument") return null;
  const parsed = PersistedCourseThemeSchema.safeParse(courseDocument.attrs["theme"]);
  return parsed.success ? parsed.data : null;
}
