import type { CSSProperties } from "react";

import { imagePositionToCss } from "@/editor/media/model/image-position";
import { SurfaceBackgroundSchema } from "@/schemas/course-document";

const SurfaceBackgroundDraftSchema = SurfaceBackgroundSchema.nullable();

export function surfaceBackgroundStyle(value: unknown): CSSProperties | undefined {
  const parsed = SurfaceBackgroundDraftSchema.safeParse(value);
  if (!parsed.success || !parsed.data) return undefined;

  const background = parsed.data;
  const style: CSSProperties = {};

  if (background.color) {
    style.backgroundColor = background.color;
  }

  if (background.imageUrl) {
    style.backgroundImage = `url(${JSON.stringify(background.imageUrl)})`;
    style.backgroundPosition = imagePositionToCss(background.imagePosition);
    style.backgroundRepeat = "no-repeat";
    style.backgroundSize = "cover";
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

export function surfaceBackgroundStyleAttribute(value: unknown): string | undefined {
  const parsed = SurfaceBackgroundDraftSchema.safeParse(value);
  if (!parsed.success || !parsed.data) return undefined;

  const background = parsed.data;
  const rules: string[] = [];

  if (background.color && isSafeHexColor(background.color)) {
    rules.push(`background-color: ${background.color}`);
  }

  if (background.imageUrl) {
    rules.push(`background-image: url(${JSON.stringify(background.imageUrl)})`);
    rules.push(`background-position: ${imagePositionToCss(background.imagePosition)}`);
    rules.push("background-repeat: no-repeat");
    rules.push("background-size: cover");
  }

  return rules.length > 0 ? rules.join("; ") : undefined;
}

export function surfaceBackgroundDataAttrs(value: unknown): {
  "data-surface-background-color"?: string;
  "data-surface-background-image"?: string;
} {
  const parsed = SurfaceBackgroundDraftSchema.safeParse(value);
  if (!parsed.success || !parsed.data) return {};

  return {
    ...(parsed.data.color ? { "data-surface-background-color": parsed.data.color } : {}),
    ...(parsed.data.imageUrl ? { "data-surface-background-image": "" } : {}),
  };
}

function isSafeHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{3,8}$/.test(value);
}
