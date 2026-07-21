import type { Editor } from "@tiptap/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FormProvider,
  useForm,
  type FieldErrors,
  type FieldValues,
  type Resolver,
} from "react-hook-form";
import type { ZodTypeAny } from "zod";

import { Accordion } from "@/ui/components/Accordion/Accordion";
import { Button } from "@/ui/components/Button/Button";
import { EmptyState } from "@/ui/components/EmptyState/EmptyState";
import { Sheet } from "@/ui/components/Sheet/Sheet";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { updateNodeSettingsChecked } from "@/document/model/commands/settings";
import {
  type NodeSettingsSheetDefinition,
  type SettingsSheetApply,
  type SettingsSheetAttrSurface,
  type SettingsSheetDraftTransform,
  type SettingsSheetFieldDescriptor,
} from "@/editor/configuration/settings-sheet";
import {
  type AuthoringNodeTarget,
  useAuthoringNodeTarget,
} from "@/editor/prosemirror/authoring-target";
import { DirectChildCollectionField } from "@/editor/shell/settings/controls/DirectChildCollectionField";
import { FieldRenderer } from "@/editor/shell/settings/controls/FieldRenderer";
import type { SettingsFieldDocumentTarget } from "@/editor/shell/settings/controls/fields/types";

import { resolveSettingsContext, type SettingsContext } from "./settings-context";

import "./configuration-settings-sheet.css";

export type ConfigurationNodeSettingsSheetDefinition = Omit<NodeSettingsSheetDefinition, "attr"> & {
  attr: string;
};

/**
 * Submit settings sheet values and dispatch the write to the editor.
 *
 * Pure helper, extracted from ConfigurationSettingsSheet's handleSave so the
 * generic write and owner-apply contracts have a focused test seam.
 *
 * Generic writes validate against the persisted attr schema before writing.
 * Owner-provided apply hooks receive submitted form values directly and own
 * validation plus persistence semantics for that item.
 */
export interface ApplySettingsSheetSettingsArgs<T extends ZodTypeAny> {
  schema: T;
  editSchema?: ZodTypeAny;
  attr: string;
  target: AuthoringNodeTarget;
  values: unknown;
  apply?: SettingsSheetApply;
}

export type ApplySettingsSheetSettingsResult = { ok: true } | { ok: false; error: string };

export type ParseSettingsSheetDraftResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export function applySettingsSheetSettings<T extends ZodTypeAny>(
  args: ApplySettingsSheetSettingsArgs<T>,
): ApplySettingsSheetSettingsResult {
  const { schema, attr, target, values, apply } = args;
  const checked = target.transact((tr, resolved) => {
    if (apply) {
      return apply({
        tr,
        target: resolved,
        attr: attr as SettingsSheetAttrSurface,
        schema,
        ...(args.editSchema ? { editSchema: args.editSchema } : {}),
        value: values,
      });
    }

    const nodeId = resolved.node.attrs["id"];
    if (typeof nodeId !== "string") {
      return {
        ok: false,
        issue: { code: "missing_settings_target_id", message: "The settings target has no id." },
      };
    }
    return updateNodeSettingsChecked({
      tr,
      nodeId,
      nodeType: resolved.node.type.name,
      attr,
      schema,
      value: values,
    });
  });
  if (!checked.ok) return { ok: false, error: checked.issue.message };
  return { ok: true };
}

export function parseSettingsSheetDraft<T extends ZodTypeAny>(
  schema: T,
  raw: unknown,
  createInitialDraft?: () => unknown,
  toDraft?: SettingsSheetDraftTransform,
): ParseSettingsSheetDraftResult {
  const draftRaw = toDraft ? toDraft(raw) : raw;
  const parsed = schema.safeParse(draftRaw ?? {});
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  if ((raw === null || raw === undefined) && createInitialDraft) {
    const fallback = schema.safeParse(createInitialDraft());
    if (fallback.success) {
      return { ok: true, data: fallback.data };
    }
  }

  return { ok: false, error: parsed.error.message };
}

interface ConfigurationSettingsSheetProps {
  editor: Editor;
  nodeType: string | null;
  /** Document position of the configured target node. null when no
   *  configurable target is selected. */
  pos: number | null;
  /** Stable persisted id of the configured target node. */
  targetId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: ConfigurationNodeSettingsSheetDefinition;
  title?: string;
}

interface SettingsSheetDraftLoad {
  initialDraft: unknown;
  key: string;
  loadError: string | null;
}

interface ResolveSettingsSheetDraftLoadArgs {
  attr: string | undefined;
  nodeType: string | null;
  entry: ConfigurationNodeSettingsSheetDefinition | undefined;
  open: boolean;
  formSchema: ZodTypeAny | undefined;
  target: AuthoringNodeTarget | null;
  targetId: string | null;
}

/**
 * Shared configuration settings sheet. Slides in from the right so the
 * canvas stays visible while authors configure a block, layout, or section.
 * Reads section descriptors from registered node definitions, renders typed
 * fields, validates with `safeParse`, and writes back through checked
 * transaction helpers.
 */
export function ConfigurationSettingsSheet({
  editor,
  nodeType,
  entry: entryOverride,
  pos,
  targetId,
  title: titleOverride,
  open,
  onOpenChange,
}: ConfigurationSettingsSheetProps) {
  const definition = nodeType ? builtInBlockRegistry.getByNodeType(nodeType) : undefined;
  const entry = entryOverride ?? definition?.settingsSheet;
  const persistedSchema = entry?.schema;
  const formSchema = entry?.editSchema ?? persistedSchema;
  const attr = entry?.attr;
  const target = useAuthoringNodeTarget(
    editor,
    nodeType && targetId ? { id: targetId, nodeType } : null,
  );
  const resolvedTarget = target?.read() ?? null;
  const settingsTargetPos = resolvedTarget?.pos ?? (target === null ? pos : null);

  const targetTitle = useMemo(() => {
    if (titleOverride) return titleOverride;
    if (!nodeType) return null;
    return resolveSettingsTargetTitle(nodeType);
  }, [nodeType, titleOverride]);

  const draftLoad = resolveSettingsSheetDraftLoad({
    attr,
    nodeType,
    entry,
    formSchema,
    open,
    target,
    targetId,
  });
  const settingsContext = useMemo(
    () =>
      resolveSettingsContext({
        blockDefinitions: builtInBlockRegistry,
        editor,
        target:
          nodeType && settingsTargetPos !== null ? { nodeType, pos: settingsTargetPos } : null,
      }),
    [editor, nodeType, settingsTargetPos],
  );
  const renderedEntry = useMemo(
    () =>
      markManagedSettings({
        entry,
        settingsContext,
      }),
    [entry, settingsContext],
  );

  return (
    <ConfigurationSettingsSheetContent
      key={draftLoad.key}
      attr={attr}
      targetTitle={targetTitle}
      editor={editor}
      entry={renderedEntry}
      initialDraft={draftLoad.initialDraft}
      loadError={draftLoad.loadError}
      onOpenChange={onOpenChange}
      open={open}
      formSchema={formSchema}
      persistedSchema={persistedSchema}
      target={target}
    />
  );
}

export function resolveSettingsTargetTitle(nodeType: string): string {
  return builtInBlockRegistry.getByNodeType(nodeType)?.insert?.title ?? nodeType;
}

function resolveSettingsSheetDraftLoad({
  attr,
  nodeType,
  entry,
  open,
  formSchema,
  target,
  targetId,
}: ResolveSettingsSheetDraftLoadArgs): SettingsSheetDraftLoad {
  if (!entry || !formSchema || !attr || !target || !targetId || !open) {
    return {
      initialDraft: {},
      key: `inactive:${nodeType ?? "none"}:${open ? "open" : "closed"}`,
      loadError: null,
    };
  }

  const resolved = target.read();
  if (!resolved) {
    return {
      initialDraft: {},
      key: `target:${nodeType}:${targetId}:${attr}`,
      loadError: "The selected item is no longer available.",
    };
  }

  const parsed = parseSettingsSheetDraft(
    formSchema,
    resolved.node.attrs[attr],
    entry.createInitialDraft,
    entry.toDraft,
  );

  if (!parsed.ok) {
    return {
      initialDraft: {},
      key: `target:${nodeType}:${targetId}:${attr}`,
      loadError: parsed.error,
    };
  }

  return {
    initialDraft: parsed.data,
    key: `target:${nodeType}:${targetId}:${attr}`,
    loadError: null,
  };
}

function markManagedSettings({
  entry,
  settingsContext,
}: {
  entry: ConfigurationNodeSettingsSheetDefinition | undefined;
  settingsContext: SettingsContext;
}): ConfigurationNodeSettingsSheetDefinition | undefined {
  if (!entry || settingsContext.managedFields.size === 0) return entry;

  return {
    ...entry,
    sections: entry.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => markManagedField(field, settingsContext)),
    })),
  };
}

function markManagedField(
  field: SettingsSheetFieldDescriptor,
  settingsContext: SettingsContext,
): SettingsSheetFieldDescriptor {
  const managed = settingsContext.managedFields.get(field.name);
  if (!managed) return field;
  return {
    ...field,
    disabledReason: managed.reason,
    ...(managed.hint ? { disabledHint: managed.hint } : {}),
  };
}

interface ConfigurationSettingsSheetContentProps {
  attr: string | undefined;
  targetTitle: string | null;
  editor: Editor;
  entry: ConfigurationNodeSettingsSheetDefinition | undefined;
  initialDraft: unknown;
  loadError: string | null;
  open: boolean;
  formSchema: ZodTypeAny | undefined;
  persistedSchema: ZodTypeAny | undefined;
  target: AuthoringNodeTarget | null;
  onOpenChange: (open: boolean) => void;
}

function ConfigurationSettingsSheetContent({
  attr,
  targetTitle,
  editor,
  entry,
  initialDraft,
  loadError,
  onOpenChange,
  open,
  formSchema,
  persistedSchema,
  target,
}: ConfigurationSettingsSheetContentProps) {
  const documentRevision = editor.state.doc;
  const ownerAppliesSettings = Boolean(entry?.apply);
  const form = useForm<FieldValues>({
    defaultValues: toFormDefaultValues(initialDraft),
    ...(formSchema && !ownerAppliesSettings
      ? { resolver: zodResolver(formSchema) as Resolver<FieldValues> }
      : {}),
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  // Keep the controlled owner mounted until Radix completes close-autofocus.
  const [sheetOpen, setSheetOpen] = useState(open);
  const documentTarget = useMemo<SettingsFieldDocumentTarget | undefined>(() => {
    if (!persistedSchema || !attr || !target) return undefined;
    return {
      editor: target.editor,
      readField(name) {
        const value = target.read()?.node.attrs[attr];
        return getValueAtPath(value, name);
      },
      writeField(name, nextValue) {
        const checked = target.transact((tr, resolved) => {
          const current = resolved.node.attrs[attr];
          const parsed = persistedSchema.safeParse(setValueAtPath(current, name, nextValue));
          if (!parsed.success) {
            return {
              ok: false,
              issue: { code: "invalid_settings_field_value", message: parsed.error.message },
            };
          }
          const nodeId = resolved.node.attrs["id"];
          if (typeof nodeId !== "string") {
            return {
              ok: false,
              issue: {
                code: "missing_settings_target_id",
                message: "The settings target has no id.",
              },
            };
          }
          return updateNodeSettingsChecked({
            tr,
            nodeId,
            nodeType: resolved.node.type.name,
            attr,
            schema: persistedSchema,
            value: parsed.data,
          });
        });
        return checked.ok;
      },
    };
  }, [attr, persistedSchema, target]);

  useEffect(() => {
    setSheetOpen(open);
  }, [open]);

  const handleSheetOpenChange = (nextOpen: boolean) => {
    setSheetOpen(nextOpen);
    if (nextOpen) onOpenChange(true);
  };

  const handleSubmit = (values: FieldValues) => {
    if (!persistedSchema || !attr || !target) return;
    const result = applySettingsSheetSettings({
      schema: persistedSchema,
      ...(formSchema && formSchema !== persistedSchema ? { editSchema: formSchema } : {}),
      attr,
      target,
      values,
      ...(entry?.apply ? { apply: entry.apply } : {}),
    });
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    setSubmitError(null);
    handleSheetOpenChange(false);
  };

  const handleInvalidSubmit = (errors: FieldErrors<FieldValues>) => {
    setSubmitError(firstFieldErrorMessage(errors));
  };

  const handleCancel = () => {
    setSubmitError(null);
    handleSheetOpenChange(false);
  };
  const handleSave = form.handleSubmit(handleSubmit, handleInvalidSubmit);

  return (
    <Sheet.Root open={sheetOpen} onOpenChange={handleSheetOpenChange}>
      <Sheet.Content
        side="right"
        onOpenAutoFocus={() => {
          const ownerWindow = editor.view.dom.ownerDocument.defaultView;
          const activeElement = editor.view.dom.ownerDocument.activeElement;
          focusReturnRef.current =
            ownerWindow && activeElement instanceof ownerWindow.HTMLElement ? activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          const focusReturn = focusReturnRef.current;
          const ownerWindow = focusReturn?.ownerDocument.defaultView;
          focusReturnRef.current = null;
          if (focusReturn?.isConnected) {
            event.preventDefault();
            focusReturn.focus();
          }
          // The owner may unmount this host; defer that update until Radix has
          // finished tearing down its focus scope and dismiss layer.
          if (ownerWindow) {
            ownerWindow.queueMicrotask(() => onOpenChange(false));
          } else {
            onOpenChange(false);
          }
        }}
      >
        <Sheet.Header closeLabel="Close settings">
          <Sheet.Title>{entry?.title ?? targetTitle ?? "Settings"}</Sheet.Title>
          <Sheet.Description>
            {entry?.description ?? "Configure this item's authoring options."}
          </Sheet.Description>
        </Sheet.Header>

        <FormProvider {...form}>
          <div className="sc-settings-sheet-form">
            <Sheet.Body>
              {entry && formSchema && attr && !loadError ? (
                <Accordion.Root
                  type="multiple"
                  defaultValue={defaultOpenSections(entry.sections, entry.defaultOpenSections)}
                >
                  {entry.sections.map((section) => (
                    <Accordion.Item key={section.id} value={section.id}>
                      <Accordion.Header id={settingsSectionTriggerId(section.id)}>
                        {section.title}
                      </Accordion.Header>
                      <Accordion.Content
                        id={settingsSectionContentId(section.id)}
                        role="region"
                        aria-labelledby={settingsSectionTriggerId(section.id)}
                        {...(section.description
                          ? {
                              "aria-describedby": settingsSectionDescriptionId(section.id),
                            }
                          : {})}
                      >
                        <div className="sc-settings-sheet-section-fields">
                          {section.description && (
                            <p
                              id={settingsSectionDescriptionId(section.id)}
                              className="sc-settings-sheet-section-description"
                            >
                              {section.description}
                            </p>
                          )}
                          {section.fields.map((descriptor) => (
                            <FieldRenderer
                              key={`${section.id}:${descriptor.name}`}
                              descriptor={descriptor}
                              documentRevision={documentRevision}
                              {...(documentTarget ? { documentTarget } : {})}
                            />
                          ))}
                          {section.collections?.map((collection) =>
                            target ? (
                              <DirectChildCollectionField
                                key={`${section.id}:${collection.id}`}
                                descriptor={collection}
                                target={target}
                              />
                            ) : null,
                          )}
                        </div>
                      </Accordion.Content>
                    </Accordion.Item>
                  ))}
                </Accordion.Root>
              ) : (
                <div className="sc-settings-sheet-empty">
                  {loadError ? (
                    <p className="sc-settings-sheet-load-error" role="alert">
                      These settings could not be loaded. {loadError}
                    </p>
                  ) : (
                    <EmptyState
                      title="No settings"
                      description="This item has no authoring options to configure."
                    />
                  )}
                </div>
              )}

              {submitError && (
                <div className="sc-settings-sheet-submit-error-frame">
                  <p className="sc-settings-sheet-submit-error" role="alert">
                    {submitError}
                  </p>
                </div>
              )}
            </Sheet.Body>

            <Sheet.Footer>
              <Button type="button" variant="secondary" size="md" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={!entry || Boolean(loadError)}
                onClick={handleSave}
              >
                Save
              </Button>
            </Sheet.Footer>
          </div>
        </FormProvider>
      </Sheet.Content>
    </Sheet.Root>
  );
}

function toFormDefaultValues(value: unknown): FieldValues {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as FieldValues) : {};
}

function getValueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    return current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, unknown>)[segment]
      : undefined;
  }, value);
}

function setValueAtPath(value: unknown, path: string, nextValue: unknown): unknown {
  const root =
    value && typeof value === "object" && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  const segments = path.split(".");
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    const next =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    current[segment] = next;
    current = next;
  }
  const leaf = segments.at(-1);
  if (leaf) current[leaf] = nextValue;
  return root;
}

function settingsSectionDomId(sectionId: string, suffix: string): string {
  return `settings-section-${sectionId.replace(/[^a-zA-Z0-9_-]/g, "-")}-${suffix}`;
}

function settingsSectionTriggerId(sectionId: string): string {
  return settingsSectionDomId(sectionId, "trigger");
}

function settingsSectionContentId(sectionId: string): string {
  return settingsSectionDomId(sectionId, "content");
}

function settingsSectionDescriptionId(sectionId: string): string {
  return settingsSectionDomId(sectionId, "description");
}

function defaultOpenSections(
  sections: readonly { id: string }[],
  configured?: readonly string[],
): string[] {
  if (configured) return [...configured];
  const first = sections[0]?.id;
  return first ? [first] : [];
}

function firstFieldErrorMessage(errors: FieldErrors<FieldValues>): string {
  const first = findFirstFieldError(errors);
  if (!first) return "Check the highlighted settings.";
  return `${first.name}: ${first.message}`;
}

function findFirstFieldError(
  errors: FieldErrors<FieldValues>,
  prefix = "",
): { name: string; message: string } | null {
  for (const [key, value] of Object.entries(errors)) {
    if (!value || typeof value !== "object") continue;
    const name = prefix ? `${prefix}.${key}` : key;
    const message = "message" in value ? value.message : undefined;
    if (typeof message === "string" && message.length > 0) {
      return { name, message };
    }

    const nested = findFirstFieldError(value as FieldErrors<FieldValues>, name);
    if (nested) return nested;
  }

  return null;
}
