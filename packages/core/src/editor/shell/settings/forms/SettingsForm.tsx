import { useId } from "react";
import { FormProvider, type FieldValues, type UseFormReturn } from "react-hook-form";

import type {
  SettingsFormAction,
  SettingsFormActionEvent,
  SettingsFormDefinition,
  SettingsFormItemDescriptor,
  SettingsFormSection,
} from "@/editor/configuration/settings-sheet";
import type { AuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";
import { DirectChildCollectionField } from "@/editor/shell/settings/controls/DirectChildCollectionField";
import { FieldRenderer } from "@/editor/shell/settings/controls/FieldRenderer";
import { settingsFieldDomId } from "@/editor/shell/settings/controls/a11y";
import type { SettingsFieldDocumentTarget } from "@/editor/shell/settings/controls/fields/types";
import { Accordion } from "@/ui/components/Accordion/Accordion";
import { Button } from "@/ui/components/Button/Button";

import "./settings-form.css";

export interface SettingsFormProps<
  TFieldValues extends FieldValues = FieldValues,
  TActionId extends string = string,
> {
  definition: SettingsFormDefinition<TActionId>;
  authoringTarget?: AuthoringNodeTarget;
  documentRevision?: unknown;
  documentTarget?: SettingsFieldDocumentTarget;
  form: UseFormReturn<TFieldValues>;
  onAction?: (event: SettingsFormActionEvent<TActionId>) => void;
}

export function SettingsForm<TFieldValues extends FieldValues, TActionId extends string = string>({
  definition,
  authoringTarget,
  documentRevision,
  documentTarget,
  form,
  onAction,
}: SettingsFormProps<TFieldValues, TActionId>) {
  const generatedId = useId();
  const idPrefix = settingsFieldDomId(`settings-form-${generatedId}`);

  return (
    <FormProvider {...form}>
      <Accordion.Root
        type="multiple"
        defaultValue={defaultOpenSections(definition.sections, definition.defaultOpenSections)}
      >
        {definition.sections.map((section) => (
          <Accordion.Item key={section.id} value={section.id}>
            <Accordion.Header id={settingsSectionTriggerId(idPrefix, section.id)}>
              {section.title}
            </Accordion.Header>
            <Accordion.Content
              id={settingsSectionContentId(idPrefix, section.id)}
              role="region"
              aria-labelledby={settingsSectionTriggerId(idPrefix, section.id)}
              {...(section.description
                ? {
                    "aria-describedby": settingsSectionDescriptionId(idPrefix, section.id),
                  }
                : {})}
            >
              <SettingsFormSectionItems
                section={section}
                authoringTarget={authoringTarget}
                idPrefix={idPrefix}
                documentRevision={documentRevision}
                documentTarget={documentTarget}
                onAction={onAction}
              />
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </FormProvider>
  );
}

function SettingsFormSectionItems<TActionId extends string>({
  section,
  authoringTarget,
  idPrefix,
  documentRevision,
  documentTarget,
  onAction,
}: {
  section: SettingsFormSection<TActionId>;
  authoringTarget: AuthoringNodeTarget | undefined;
  idPrefix: string;
  documentRevision: unknown;
  documentTarget: SettingsFieldDocumentTarget | undefined;
  onAction: ((event: SettingsFormActionEvent<TActionId>) => void) | undefined;
}) {
  return (
    <div className="sc-settings-form__section-items">
      {section.description ? (
        <p
          id={settingsSectionDescriptionId(idPrefix, section.id)}
          className="sc-settings-form__section-description"
        >
          {section.description}
        </p>
      ) : null}
      {section.items.map((item) => (
        <SettingsFormItem
          key={settingsFormItemKey(section.id, item)}
          item={item}
          authoringTarget={authoringTarget}
          documentRevision={documentRevision}
          documentTarget={documentTarget}
          idPrefix={idPrefix}
        />
      ))}
      <SettingsFormActions
        actions={section.actions}
        location="section"
        onAction={onAction}
        sectionId={section.id}
      />
    </div>
  );
}

function SettingsFormItem({
  item,
  authoringTarget,
  documentRevision,
  documentTarget,
  idPrefix,
}: {
  item: SettingsFormItemDescriptor;
  authoringTarget: AuthoringNodeTarget | undefined;
  documentRevision: unknown;
  documentTarget: SettingsFieldDocumentTarget | undefined;
  idPrefix: string;
}) {
  if (item.kind === "directChildCollection") {
    return authoringTarget ? (
      <DirectChildCollectionField descriptor={item} target={authoringTarget} />
    ) : (
      <p className="sc-settings-form__item-error" role="alert">
        {item.itemLabel} collection is unavailable because its authoring target is missing.
      </p>
    );
  }

  if (item.kind === "richText" && !documentTarget) {
    return (
      <p className="sc-settings-form__item-error" role="alert">
        {item.label} is unavailable because its document target is missing.
      </p>
    );
  }

  return (
    <FieldRenderer
      descriptor={item}
      documentRevision={documentRevision}
      idPrefix={idPrefix}
      {...(documentTarget ? { documentTarget } : {})}
    />
  );
}

function settingsFormItemKey(sectionId: string, item: SettingsFormItemDescriptor): string {
  return item.kind === "directChildCollection"
    ? `${sectionId}:collection:${item.id}`
    : `${sectionId}:field:${item.name}`;
}

export function SettingsFormActions<TActionId extends string>({
  actions,
  location,
  onAction,
  sectionId,
}: {
  actions: readonly SettingsFormAction<TActionId>[] | undefined;
  location: "footer" | "section";
  onAction: ((event: SettingsFormActionEvent<TActionId>) => void) | undefined;
  sectionId?: string;
}) {
  if (!actions?.length) return null;

  return (
    <div className={`sc-settings-form__${location}-actions`}>
      {actions.map((action) => (
        <Button
          key={action.id}
          size={location === "section" ? "sm" : "md"}
          variant={action.variant ?? (location === "section" ? "ghost" : "secondary")}
          disabled={action.disabled}
          {...(action.ariaLabel ? { "aria-label": action.ariaLabel } : {})}
          onClick={() =>
            onAction?.({
              actionId: action.id,
              ...(sectionId !== undefined ? { sectionId } : {}),
            })
          }
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

function defaultOpenSections(
  sections: readonly { id: string }[],
  configured?: readonly string[],
): string[] {
  if (configured) return [...configured];
  const first = sections[0]?.id;
  return first ? [first] : [];
}

function settingsSectionDomId(idPrefix: string, sectionId: string, suffix: string): string {
  return settingsFieldDomId(`${idPrefix}-section-${sectionId}-${suffix}`);
}

function settingsSectionTriggerId(idPrefix: string, sectionId: string): string {
  return settingsSectionDomId(idPrefix, sectionId, "trigger");
}

function settingsSectionContentId(idPrefix: string, sectionId: string): string {
  return settingsSectionDomId(idPrefix, sectionId, "content");
}

function settingsSectionDescriptionId(idPrefix: string, sectionId: string): string {
  return settingsSectionDomId(idPrefix, sectionId, "description");
}
