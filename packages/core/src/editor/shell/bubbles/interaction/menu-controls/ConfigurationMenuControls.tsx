import type { Editor } from "@tiptap/react";

import {
  applyConfigurationDraft,
  readConfigurationDraft,
  type ConfigurationAccessDefinition,
} from "@/editor/configuration/configuration-access";
import type {
  QuickControlDescriptor,
  QuickMenuDefinition,
} from "@/editor/configuration/quick-menu";
import { useAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";

import { MenuControls } from "./MenuControls";

interface ConfigurationMenuControlsProps {
  editor: Editor;
  nodeType: string;
  pos: number | null;
  targetId: string | null;
  attr: QuickMenuDefinition["attr"];
  schema: QuickMenuDefinition["schema"];
  editSchema?: QuickMenuDefinition["editSchema"];
  read?: QuickMenuDefinition["read"];
  apply?: QuickMenuDefinition["apply"];
  controls: readonly QuickControlDescriptor[];
}

export function ConfigurationMenuControls({
  editor,
  nodeType,
  targetId,
  attr,
  schema,
  editSchema,
  read,
  apply,
  controls,
}: ConfigurationMenuControlsProps) {
  const target = useAuthoringNodeTarget(editor, targetId ? { id: targetId, nodeType } : null);
  if (controls.length === 0) return null;

  const definition = {
    attr,
    schema,
    ...(editSchema ? { editSchema } : {}),
    ...(read ? { read } : {}),
    ...(apply ? { apply } : {}),
  } satisfies ConfigurationAccessDefinition;
  const resolved = target?.read() ?? null;
  const value = resolved ? toRecord(readConfigurationDraft({ definition, target: resolved })) : {};
  const updateName = (name: string, next: unknown) => {
    if (!target) return false;

    const checked = target.transact((tr, latestTarget) => {
      const latestValue = toRecord(readConfigurationDraft({ definition, target: latestTarget }));
      const prunedValue = pruneEmptyRecords(writeName(latestValue, name, next));
      const draftSchema = definition.editSchema ?? definition.schema;
      const candidate =
        isEmptyRecord(prunedValue) && draftSchema.safeParse(prunedValue).success === false
          ? null
          : prunedValue;

      return applyConfigurationDraft({
        definition,
        tr,
        target: latestTarget,
        value: candidate,
      });
    });

    return checked.ok;
  };
  return (
    <MenuControls
      controls={controls}
      value={value}
      disabled={resolved === null}
      onValueChange={updateName}
    />
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function writeName(
  value: Record<string, unknown>,
  name: string,
  next: unknown,
): Record<string, unknown> {
  const segments = name.split(".");
  const root = { ...value };
  let cursor: Record<string, unknown> = root;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    const current = cursor[segment];
    const child = isRecord(current) ? { ...current } : {};
    cursor[segment] = child;
    cursor = child;
  }

  const leaf = segments[segments.length - 1];
  if (!leaf) return root;
  if (next === undefined) {
    delete cursor[leaf];
  } else {
    cursor[leaf] = next;
  }
  return root;
}

function pruneEmptyRecords(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    if (isRecord(child)) {
      const prunedChild = pruneEmptyRecords(child);
      if (isEmptyRecord(prunedChild)) continue;
      result[key] = prunedChild;
      continue;
    }

    result[key] = child;
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmptyRecord(value: Record<string, unknown>): boolean {
  return Object.keys(value).length === 0;
}
