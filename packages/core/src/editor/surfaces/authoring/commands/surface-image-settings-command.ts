import type { Editor } from "@tiptap/core";

import { createAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";
import type { RegisteredSurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";
import { isRegisteredSlideCompositionSurfaceDefinition } from "@/editor/surfaces/model/slide-composition-definition";
import { SurfaceOwnedImageSchema } from "@/editor/surfaces/model/surface-owned-image";
import { updateSurfaceSettingsChecked } from "@/editor/surfaces/model/commands/surface-settings-command";

interface SetSurfaceOwnedImageCheckedInput {
  definition: RegisteredSurfaceVariantDefinition;
  editor: Editor;
  image: unknown;
  role: string;
  surfaceId: string;
}

export function setSurfaceOwnedImageChecked({
  definition,
  editor,
  image,
  role,
  surfaceId,
}: SetSurfaceOwnedImageCheckedInput): { ok: true } | { ok: false; error: string } {
  const checked = createAuthoringNodeTarget(editor, {
    id: surfaceId,
    nodeType: "surface",
  }).transact((tr, target) => {
    const surface = target.node;

    const variant = surface.attrs["variant"];
    if (typeof variant !== "string") {
      return failure("invalid_surface_variant", `Surface "${surfaceId}" has no valid variant.`);
    }

    if (definition.id !== variant || !isRegisteredSlideCompositionSurfaceDefinition(definition)) {
      return failure(
        "invalid_surface_image_variant",
        `Surface variant "${variant}" is not a slide composition.`,
      );
    }
    if (!definition.slideComposition.imageSlots.some((declaredRole) => declaredRole === role)) {
      return failure(
        "undeclared_surface_image_role",
        `Surface variant "${variant}" does not declare image role "${role}".`,
      );
    }

    const parsedImage = SurfaceOwnedImageSchema.safeParse(image);
    if (!parsedImage.success) {
      return failure("invalid_surface_owned_image", parsedImage.error.message);
    }

    const parsedSettings = definition.settingsSchema.safeParse(surface.attrs["settings"]);
    if (!parsedSettings.success) {
      return failure("invalid_surface_image_settings", parsedSettings.error.message);
    }
    if (!isRecord(parsedSettings.data) || !isRecord(parsedSettings.data["images"])) {
      return failure(
        "invalid_surface_image_settings",
        `Surface variant "${variant}" has invalid image settings.`,
      );
    }

    return updateSurfaceSettingsChecked({
      tr,
      surfaceId,
      schema: definition.settingsSchema,
      value: {
        ...parsedSettings.data,
        images: {
          ...parsedSettings.data["images"],
          [role]: parsedImage.data,
        },
      },
    });
  });

  if (!checked.ok) {
    return {
      ok: false,
      error:
        checked.issue.code === "missing_authoring_target"
          ? `Surface "${surfaceId}" was not found.`
          : checked.issue.message,
    };
  }
  return { ok: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(code: string, message: string) {
  return { ok: false as const, issue: { code, message } };
}
