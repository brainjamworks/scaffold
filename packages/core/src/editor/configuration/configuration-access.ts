import type { Transaction } from "@tiptap/pm/state";
import type { ZodTypeAny } from "zod";

import type { CheckedMutationResult } from "@/document/model/commands/checked-transactions";
import { updateNodeSettingsChecked } from "@/document/model/commands/settings";
import type { ResolvedStableNode } from "@/document/model/identity/resolve-stable-node";

import type { SettingsSheetApply } from "./settings-sheet";

export type ConfigurationAccessAttr = "data" | "settings" | "options";

export interface ConfigurationReadInput {
  target: ResolvedStableNode;
  attr: ConfigurationAccessAttr;
  schema: ZodTypeAny;
  editSchema?: ZodTypeAny;
}

export type ConfigurationRead = (input: ConfigurationReadInput) => unknown;

export interface ConfigurationAccessDefinition {
  attr: ConfigurationAccessAttr;
  schema: ZodTypeAny;
  editSchema?: ZodTypeAny;
  createInitialDraft?: () => unknown;
  toDraft?: (raw: unknown) => unknown;
  read?: ConfigurationRead;
  apply?: SettingsSheetApply;
}

export function readConfigurationDraft({
  definition,
  target,
}: {
  definition: ConfigurationAccessDefinition;
  target: ResolvedStableNode;
}): unknown {
  const draftSchema = definition.editSchema ?? definition.schema;
  if (definition.read) {
    return draftSchema.parse(
      definition.read({
        target,
        attr: definition.attr,
        schema: definition.schema,
        ...(definition.editSchema ? { editSchema: definition.editSchema } : {}),
      }) ?? {},
    );
  }

  const raw = target.node.attrs[definition.attr];
  const rawDraft = definition.toDraft ? definition.toDraft(raw) : raw;
  const parsed = draftSchema.safeParse(rawDraft ?? {});
  if (parsed.success) return parsed.data;

  if ((raw === null || raw === undefined) && definition.createInitialDraft) {
    return draftSchema.parse(definition.createInitialDraft());
  }

  throw parsed.error;
}

export function applyConfigurationDraft({
  definition,
  tr,
  target,
  value,
}: {
  definition: ConfigurationAccessDefinition;
  tr: Transaction;
  target: ResolvedStableNode;
  value: unknown;
}): CheckedMutationResult<Transaction> {
  if (definition.apply) {
    return definition.apply({
      tr,
      target,
      attr: definition.attr,
      schema: definition.schema,
      ...(definition.editSchema ? { editSchema: definition.editSchema } : {}),
      value,
    });
  }

  const nodeId = target.node.attrs["id"];
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
    nodeType: target.node.type.name,
    attr: definition.attr,
    schema: definition.schema,
    value,
  });
}
