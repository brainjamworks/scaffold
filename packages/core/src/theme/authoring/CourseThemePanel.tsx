import { PaletteIcon as Palette } from "@phosphor-icons/react";
import type { CourseThemePaletteSlot } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import { useMemo } from "react";

import type { SettingsFormActionEvent } from "@/editor/configuration/settings-sheet";
import { SettingsForm, SettingsFormActions } from "@/editor/shell/settings/forms/SettingsForm";
import {
  PersistedCourseThemeSchema,
  type CourseThemeValues,
  type PersistedCourseTheme,
} from "@/schemas/course-document";
import type { ResolvedCourseTheme, ThemeCatalogue } from "@/theme/model";
import { Sheet } from "@/ui/components/Sheet/Sheet";
import { iconSm } from "@/ui/tokens/icon-sizes";

import {
  resetCourseTheme,
  resetCourseThemeDarkDerivation,
  resetCourseThemePaletteSection,
  resetCourseThemeSection,
  selectCoursePreset,
  updateCourseTheme,
  updateCourseThemePaletteSlot,
} from "./course-theme-commands";
import {
  COURSE_THEME_BLUR_FIELDS,
  courseThemeFormDefinition,
  derivedDarkPalette,
  isCourseThemeDesignField,
  isCourseThemePaletteField,
  isCourseThemeTypographyField,
  parseCourseThemeDesign,
  parseCourseThemePalette,
  parseCourseThemeTypography,
  toCourseThemeFormValues,
  useLiveThemeSettingsForm,
  type CourseThemeActionId,
  type CourseThemeFormValues,
} from "./theme-settings-form";
import "./CourseThemePanel.css";

export interface CourseThemePanelProps {
  editor: Editor | null;
  catalogue: ThemeCatalogue;
  theme: PersistedCourseTheme;
  resolvedTheme: ResolvedCourseTheme;
  onThemeChange: (theme: PersistedCourseTheme) => void;
}

export function CourseThemePanel({
  editor,
  catalogue,
  theme,
  resolvedTheme,
  onThemeChange,
}: CourseThemePanelProps) {
  const selectedPreset = catalogue.getPreset(theme.preset.id);
  const effectivePreset = selectedPreset ?? catalogue.defaultPreset;
  const editable = Boolean(editor && selectedPreset && theme.values);
  const values = theme.values ?? effectivePreset.values;
  const formValues = useMemo(
    () => toCourseThemeFormValues(theme, values, resolvedTheme.mode),
    [resolvedTheme.mode, theme, values],
  );
  const definition = useMemo(
    () =>
      courseThemeFormDefinition({
        catalogue,
        editable,
        mode: resolvedTheme.mode,
        preset: effectivePreset,
        resetThemeEnabled: Boolean(editor && selectedPreset),
        values,
      }),
    [catalogue, editable, editor, effectivePreset, resolvedTheme.mode, selectedPreset, values],
  );

  const notifyThemeChange = () => {
    const nextTheme = readEditorTheme(editor);
    if (nextTheme) onThemeChange(nextTheme);
  };

  const commitField = (draft: CourseThemeFormValues, name: keyof CourseThemeFormValues) => {
    if (!editor) return false;

    if (name === "presetId") {
      const nextPreset = catalogue.getPreset(draft.presetId);
      if (!nextPreset || !selectCoursePreset(editor, nextPreset)) return false;
      notifyThemeChange();
      return true;
    }

    const persisted = readEditorTheme(editor);
    const preset = persisted ? catalogue.getPreset(persisted.preset.id) : null;
    if (!persisted?.values || !preset) return false;

    if (isCourseThemePaletteField(name)) {
      return commitPaletteField({
        draft,
        editor,
        mode: resolvedTheme.mode,
        name,
        values: persisted.values,
        preset,
        notifyThemeChange,
      });
    }

    const nextTheme = structuredClone(persisted);
    const nextValues = nextTheme.values;
    if (!nextValues) return false;
    if (isCourseThemeTypographyField(name)) {
      const typography = parseCourseThemeTypography(draft);
      if (!typography) return false;
      nextValues.typography = typography;
    } else if (isCourseThemeDesignField(name)) {
      const design = parseCourseThemeDesign(draft);
      if (!design) return false;
      nextValues.design = design;
    } else {
      return false;
    }

    if (!updateCourseTheme(editor, nextTheme)) return false;
    notifyThemeChange();
    return true;
  };

  const { form, onBlur } = useLiveThemeSettingsForm<CourseThemeFormValues>({
    values: formValues,
    onCommit: commitField,
    commitOnBlur: COURSE_THEME_BLUR_FIELDS,
  });

  const handleAction = ({ actionId }: SettingsFormActionEvent<CourseThemeActionId>) => {
    if (!editor) return;
    const persisted = readEditorTheme(editor);
    const preset = persisted ? catalogue.getPreset(persisted.preset.id) : null;
    if (!persisted || !preset) return;

    const changed = runThemeAction(editor, preset, actionId);
    if (changed) notifyThemeChange();
  };

  return (
    <Sheet.Root>
      <Sheet.Trigger asChild>
        <button
          type="button"
          className="sc-scaffold-authoring-action"
          aria-label="Open course theme"
          title="Course theme"
          data-compact-label
          data-state="default"
          disabled={!editor}
        >
          <Palette size={iconSm} aria-hidden />
          <span className="sc-scaffold-authoring-action-label">Theme</span>
        </button>
      </Sheet.Trigger>
      <Sheet.Content side="right" className="sc-course-theme-panel">
        <Sheet.Header closeLabel="Close course theme">
          <Sheet.Title>Course theme</Sheet.Title>
          <Sheet.Description>
            Choose the course presentation and customise colours for the current application mode.
          </Sheet.Description>
        </Sheet.Header>
        <Sheet.Body onBlur={onBlur}>
          {!resolvedTheme.available ? (
            <p className="sc-course-theme-panel-status" role="status">
              The saved theme is unavailable. {catalogue.defaultPreset.label} is shown instead.
            </p>
          ) : null}

          <SettingsForm definition={definition} form={form} onAction={handleAction} />
        </Sheet.Body>
        <Sheet.Footer>
          <SettingsFormActions
            actions={definition.footerActions}
            location="footer"
            onAction={handleAction}
          />
        </Sheet.Footer>
      </Sheet.Content>
    </Sheet.Root>
  );
}

function commitPaletteField({
  draft,
  editor,
  mode,
  name,
  values,
  preset,
  notifyThemeChange,
}: {
  draft: CourseThemeFormValues;
  editor: Editor;
  mode: ResolvedCourseTheme["mode"];
  name: CourseThemePaletteSlot;
  values: CourseThemeValues;
  preset: NonNullable<ReturnType<ThemeCatalogue["getPreset"]>>;
  notifyThemeChange: () => void;
}): boolean {
  const palette = parseCourseThemePalette(draft);
  if (!palette) return false;
  const color = palette[name];

  if (mode === "dark") {
    const derivedColor = derivedDarkPalette(values, preset)[name];
    if (color === derivedColor) {
      if (values.colors.author.dark.sourceBySlot[name] === "derived") return true;
      if (!resetCourseThemeDarkDerivation(editor, preset, name)) return false;
      notifyThemeChange();
      return true;
    }
  }

  if (!updateCourseThemePaletteSlot(editor, preset, mode, name, color)) return false;
  notifyThemeChange();
  return true;
}

function runThemeAction(
  editor: Editor,
  preset: NonNullable<ReturnType<ThemeCatalogue["getPreset"]>>,
  actionId: CourseThemeActionId,
): boolean {
  switch (actionId) {
    case "derive-dark":
      return resetCourseThemeDarkDerivation(editor, preset);
    case "reset-foundation":
      return resetCourseThemePaletteSection(editor, preset, "foundation");
    case "reset-creative":
      return resetCourseThemePaletteSection(editor, preset, "creative");
    case "reset-links":
      return resetCourseThemePaletteSection(editor, preset, "link");
    case "reset-typography":
      return resetCourseThemeSection(editor, preset, "typography");
    case "reset-design":
      return resetCourseThemeSection(editor, preset, "design");
    case "reset-theme":
      return resetCourseTheme(editor, preset);
  }
}

function readEditorTheme(editor: Editor | null): PersistedCourseTheme | null {
  const parsed = PersistedCourseThemeSchema.safeParse(
    editor?.getJSON().content?.[0]?.attrs?.["theme"],
  );
  return parsed.success ? parsed.data : null;
}
