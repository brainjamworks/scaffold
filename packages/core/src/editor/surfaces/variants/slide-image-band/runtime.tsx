import {
  readSlideImageBandSurfaceSettings,
  slideImageBandDataAttrs,
} from "@/editor/surfaces/model/templates/slide-image-band";

import { SlideImageBandImageSlot } from "../../view/variants/slide-image-band-image";
import "./styles.css";
import { SurfaceRuntimeFrame } from "../../runtime/views/SurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../../runtime/surface-runtime-view-registry";

export function SlideImageBandSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const settings = readSlideImageBandSurfaceSettings(props.node.attrs["settings"]);

  return (
    <SurfaceRuntimeFrame
      {...props}
      attributes={slideImageBandDataAttrs(props.node.attrs["settings"])}
      className="sc-slide-image-band-surface-view sc-slide-image-band-surface-runtime-view"
    >
      <SlideImageBandImageSlot image={settings.image} />
    </SurfaceRuntimeFrame>
  );
}
