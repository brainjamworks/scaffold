import {
  readSlideImageCoverSurfaceSettings,
  slideImageCoverDataAttrs,
} from "@/editor/surfaces/model/templates/slide-image-cover";

import { SlideImageCoverImageSlot } from "../../view/variants/slide-image-cover-image";
import "./styles.css";
import { SurfaceRuntimeFrame } from "../../runtime/views/SurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../../runtime/surface-runtime-view-registry";

export function SlideImageCoverSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const settings = readSlideImageCoverSurfaceSettings(props.node.attrs["settings"]);

  return (
    <SurfaceRuntimeFrame
      {...props}
      attributes={slideImageCoverDataAttrs(props.node.attrs["settings"])}
      className="sc-slide-image-cover-surface-view sc-slide-image-cover-surface-runtime-view"
    >
      <SlideImageCoverImageSlot image={settings.image} />
    </SurfaceRuntimeFrame>
  );
}
