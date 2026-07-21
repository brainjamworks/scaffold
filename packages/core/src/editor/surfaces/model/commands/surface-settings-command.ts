import type { Transaction } from "@tiptap/pm/state";
import type { ZodTypeAny } from "zod";

import { updateNodeSettingsChecked } from "@/document/model/commands/settings";
import type { CheckedMutationResult } from "@/document/model/commands/checked-transactions";
import { isValidDocPos } from "@/editor/prosemirror/position/document-position";
import {
  SurfaceSettingsSchema,
  VerticalContentPositionSchema,
  type SurfaceSettings,
  type VerticalContentPosition,
} from "@/schemas/course-document";

import { setSurfaceFooterEnabled, setSurfaceHeaderEnabled } from "./header-footer-commands";
import { readSurfaceSettings } from "../surface-settings";
import type { SurfaceVariantLookup } from "../surface-variant-registry";

interface UpdateSurfaceSettingsCheckedInput {
  tr: Transaction;
  schema: ZodTypeAny;
  surfaceId: string;
  value: unknown;
}

export function updateSurfaceSettingsChecked({
  tr,
  schema,
  surfaceId,
  value,
}: UpdateSurfaceSettingsCheckedInput): CheckedMutationResult<Transaction> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return failure("invalid_surface_settings", parsed.error.message);
  const commonSettings = SurfaceSettingsSchema.safeParse(parsed.data);
  if (!commonSettings.success) {
    return failure("invalid_common_surface_settings", commonSettings.error.message);
  }
  const checked = updateNodeSettingsChecked({
    tr,
    nodeId: surfaceId,
    nodeType: "surface",
    attr: "settings",
    schema,
    value: parsed.data,
  });
  if (!checked.ok) return checked;

  return reconcileSurfaceHeaderFooters(checked.tr, surfaceId, commonSettings.data);
}

export function setSurfaceVerticalPositionInTransaction(
  tr: Transaction,
  pos: number,
  value: VerticalContentPosition,
  surfaceVariants: SurfaceVariantLookup,
): Transaction | null {
  if (!isValidDocPos(tr.doc, pos)) return null;
  const surface = tr.doc.nodeAt(pos);
  if (!surface || surface.type.name !== "surface") return null;

  const variant = surface.attrs["variant"];
  if (typeof variant !== "string" || variant.length === 0) return null;
  const definition = surfaceVariants.get(variant);
  if (!definition?.alignment?.verticalContentPosition) return null;

  const verticalPosition = VerticalContentPositionSchema.safeParse(value);
  if (!verticalPosition.success) return null;

  const settingsSchema = definition.settingsSchema;
  const settings = settingsSchema.safeParse({
    ...readSurfaceSettings(surface.attrs["settings"]),
    verticalPosition: verticalPosition.data,
  });
  if (!settings.success) return null;

  try {
    tr.setNodeMarkup(pos, undefined, {
      ...surface.attrs,
      settings: settings.data,
    });
    tr.doc.check();
    return tr;
  } catch {
    return null;
  }
}

function reconcileSurfaceHeaderFooters(
  tr: Transaction,
  surfaceId: string,
  settings: SurfaceSettings,
): CheckedMutationResult<Transaction> {
  let result = setSurfaceHeaderEnabled({
    tr,
    surfaceId,
    enabled: settings.header?.enabled === true,
  });
  if (!result.ok) return failure("invalid_surface_header", result.error);

  result = setSurfaceFooterEnabled({
    tr,
    surfaceId,
    enabled: settings.footer?.enabled === true,
  });
  if (!result.ok) return failure("invalid_surface_footer", result.error);

  try {
    tr.doc.check();
    return { ok: true, tr };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "invalid_document_after_surface_settings_update",
        message:
          error instanceof Error
            ? error.message
            : "Updating surface header/footer produced an invalid document.",
      },
    };
  }
}

function failure(code: string, message: string): CheckedMutationResult<never> {
  return { ok: false, issue: { code, message } };
}
