import type { Editor } from "@tiptap/core";
import type { ZodTypeAny } from "zod";

import type { SettingsSheetApply } from "@/editor/configuration/settings-sheet";
import { createAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";
import { updateSurfaceSettingsChecked } from "@/editor/surfaces/model/commands/surface-settings-command";

interface SetSurfaceSettingsCheckedInput {
  editor: Editor;
  schema: ZodTypeAny;
  surfaceId: string;
  value: unknown;
}

export function setSurfaceSettingsChecked({
  editor,
  schema,
  surfaceId,
  value,
}: SetSurfaceSettingsCheckedInput): { ok: true } | { ok: false; error: string } {
  const checked = createAuthoringNodeTarget(editor, {
    id: surfaceId,
    nodeType: "surface",
  }).transact((tr, target) =>
    applySurfaceSettings({ tr, target, attr: "settings", schema, value }),
  );
  if (!checked.ok) return { ok: false, error: checked.issue.message };
  return { ok: true };
}

export const applySurfaceSettings: SettingsSheetApply = ({ tr, target, attr, schema, value }) => {
  if (target.node.type.name !== "surface" || attr !== "settings") {
    return {
      ok: false,
      issue: {
        code: "invalid_surface_settings_target",
        message: "Surface settings can only be applied to a surface settings attr.",
      },
    };
  }

  const surfaceId = target.node.attrs["id"];
  if (typeof surfaceId !== "string") {
    return {
      ok: false,
      issue: {
        code: "missing_surface_target_id",
        message: "The surface target has no stable id.",
      },
    };
  }

  return updateSurfaceSettingsChecked({ tr, surfaceId, schema, value });
};
