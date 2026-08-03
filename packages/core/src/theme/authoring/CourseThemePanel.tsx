import { PaletteIcon as Palette } from "@phosphor-icons/react";
import type { CourseThemeRef } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";

import type {
  SettingsFormActionEvent,
  SettingsFormDefinition,
  SettingsSheetSelectOption,
} from "@/editor/configuration/settings-sheet";
import { SettingsForm, SettingsFormActions } from "@/editor/shell/settings/forms/SettingsForm";
import { PersistedCourseThemeSchema, type PersistedCourseTheme } from "@/schemas/course-document";
import type { CourseColourSystemRegistry } from "@/theme/course/colour-systems/registry";
import type { CourseDesignThemeRegistry } from "@/theme/course/designs/registry";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { Sheet } from "@/ui/components/Sheet/Sheet";
import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import { iconSm } from "@/ui/tokens/icon-sizes";

import {
  resetCourseTheme,
  selectCourseColourSystem,
  selectCourseDesign,
} from "./course-theme-commands";
import "./CourseThemePanel.css";

interface CourseThemeFormValues {
  design: string;
  colourSystem: string;
}

type CourseThemeActionId = "reset-theme";

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
  const form = useForm<CourseThemeFormValues>({
    defaultValues: { design: designValue, colourSystem: colourSystemValue },
  });
  const definition = useMemo(
    () =>
      courseThemeFormDefinition({
        designs,
        colourSystems,
        editable: Boolean(editor),
      }),
    [colourSystems, designs, editor],
  );

  useEffect(() => {
    const current = form.getValues();
    if (current.design !== designValue || current.colourSystem !== colourSystemValue) {
      form.reset({ design: designValue, colourSystem: colourSystemValue });
    }
  }, [colourSystemValue, designValue, form]);

  useEffect(() => {
    const subscription = form.watch((draft, { name, type }) => {
      if (type !== "change" || (name !== "design" && name !== "colourSystem")) return;

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

      const nextTheme = readEditorTheme(editor);
      if (nextTheme) onThemeChange(nextTheme);
    });

    return subscription.unsubscribe;
  }, [colourSystemValue, colourSystems, designValue, designs, editor, form, onThemeChange]);

  const handleAction = ({ actionId }: SettingsFormActionEvent<CourseThemeActionId>) => {
    if (actionId !== "reset-theme" || !editor || !resetCourseTheme(editor)) return;
    const nextTheme = readEditorTheme(editor);
    if (nextTheme) onThemeChange(nextTheme);
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

function courseThemeFormDefinition({
  designs,
  colourSystems,
  editable,
}: {
  designs: CourseDesignThemeRegistry;
  colourSystems: CourseColourSystemRegistry;
  editable: boolean;
}): SettingsFormDefinition<CourseThemeActionId> {
  const disabled = editable
    ? {}
    : { disabledReason: "A live editor is required to change the Course theme." };

  return {
    defaultOpenSections: ["design", "colour-system"],
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
    ],
    footerActions: [
      {
        id: "reset-theme",
        label: "Reset theme",
        ariaLabel: "Reset complete theme",
        disabled: !editable,
      },
    ],
  };
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
