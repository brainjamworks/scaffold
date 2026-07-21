import { isRegisteredSlideCompositionSurfaceDefinition } from "../../model/slide-composition-definition";
import { SurfaceOwnedImageSchema } from "../../model/surface-owned-image";
import { slideCompositionDataAttrs } from "../../view/variants/slide-composition";
import { SurfaceOwnedImageSlot } from "../../view/variants/surface-owned-image-slot";
import "../../view/variants/slide-layout.css";
import { SurfaceRuntimeFrame } from "../views/SurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../surface-runtime-view-registry";

export function SlideCompositionSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const definition = props.definition;
  if (!isRegisteredSlideCompositionSurfaceDefinition(definition)) {
    throw new Error(`Surface variant "${props.variant}" is not a slide composition definition.`);
  }
  const parsedSettings = definition.settingsSchema.safeParse(props.node.attrs["settings"]);
  const images =
    parsedSettings.success &&
    isRecord(parsedSettings.data) &&
    isRecord(parsedSettings.data["images"])
      ? parsedSettings.data["images"]
      : undefined;

  return (
    <SurfaceRuntimeFrame
      {...props}
      attributes={slideCompositionDataAttrs(definition, props.node.attrs["settings"])}
      className="sc-slide-layout-surface-view sc-slide-layout-surface-runtime-view"
    >
      {definition.slideComposition.imageSlots.map((role) => {
        const parsedImage = SurfaceOwnedImageSchema.safeParse(images?.[role]);
        return (
          <SurfaceOwnedImageSlot
            key={role}
            role={role}
            {...(parsedImage.success ? { image: parsedImage.data } : {})}
          />
        );
      })}
    </SurfaceRuntimeFrame>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
