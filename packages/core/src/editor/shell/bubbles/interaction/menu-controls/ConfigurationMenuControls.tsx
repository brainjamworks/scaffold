import type { Editor } from "@tiptap/react";
import { z, type ZodTypeAny } from "zod";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { updateNodeSettingsChecked } from "@/document/model/commands/settings";
import type { QuickControlDescriptor } from "@/editor/configuration/quick-menu";

import { MenuControls } from "./MenuControls";

interface ConfigurationMenuControlsProps {
  editor: Editor;
  nodeType: string;
  pos: number | null;
  targetId: string | null;
  attr: string;
  schema?: ZodTypeAny;
  controls: readonly QuickControlDescriptor[];
}

export function ConfigurationMenuControls({
  editor,
  nodeType,
  pos,
  targetId,
  attr,
  schema,
  controls,
}: ConfigurationMenuControlsProps) {
  if (controls.length === 0) return null;

  const targetAvailable = pos !== null && targetId !== null && isValidEditorDocPos(editor, pos);
  const surfaceValue = readSurfaceValue(editor, pos, nodeType, attr);
  const updateValue = (nextValue: Record<string, unknown>) =>
    writeSurfaceValue({
      editor,
      nodeType,
      targetId,
      attr,
      ...(schema ? { schema } : {}),
      value: nextValue,
    });
  const updateName = (name: string, next: unknown) =>
    updateValue(writeName(readSurfaceValue(editor, pos, nodeType, attr), name, next));
  return (
    <MenuControls
      controls={controls}
      value={surfaceValue}
      disabled={!targetAvailable}
      onValueChange={updateName}
    />
  );
}

function readSurfaceValue(
  editor: Editor,
  pos: number | null,
  nodeType: string,
  attr: string,
): Record<string, unknown> {
  if (pos === null) return {};
  if (!isValidEditorDocPos(editor, pos)) return {};
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== nodeType) return {};
  const value = node?.attrs[attr];
  return isRecord(value) ? value : {};
}

interface WriteSurfaceValueInput {
  editor: Editor;
  nodeType: string;
  targetId: string | null;
  attr: string;
  schema?: ZodTypeAny;
  value: Record<string, unknown>;
}

function writeSurfaceValue({
  editor,
  nodeType,
  targetId,
  attr,
  schema,
  value,
}: WriteSurfaceValueInput): boolean {
  if (!targetId) return false;
  const prunedValue = pruneEmptyRecords(value);
  const candidate =
    schema && isEmptyRecord(prunedValue) && schema.safeParse(prunedValue).success === false
      ? null
      : prunedValue;
  const parsed = schema ? schema.safeParse(candidate) : { success: true, data: candidate };
  if (!parsed.success) return false;

  const result = updateNodeSettingsChecked({
    tr: editor.state.tr,
    nodeId: targetId,
    nodeType,
    attr,
    schema: schema ?? passthroughSurfaceSchema,
    value: parsed.data,
  });
  if (!result.ok) return false;

  editor.view.dispatch(result.tr);
  return true;
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

const passthroughSurfaceSchema = z.record(z.string(), z.unknown());
