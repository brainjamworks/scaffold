import type {
  DragDropCanvasData,
  EmbeddedDataId,
  ImageBlockAttrs,
  MarkerVisual,
} from "@scaffold/contracts";

export interface DragDropCourseMarker {
  readonly id: EmbeddedDataId;
  readonly label: string;
  readonly visual: MarkerVisual;
}

export interface DragDropCourseContent {
  readonly image: ImageBlockAttrs | null;
  readonly imageAspectRatio: number | null;
  readonly defaultMarkerVisual: MarkerVisual;
  readonly markers: readonly DragDropCourseMarker[];
  readonly accessibleLegend?: string;
}

export function createDragDropCourseContent(
  data: DragDropCanvasData,
  accessibleLegend?: string,
): DragDropCourseContent {
  return {
    image: data.image,
    imageAspectRatio: data.imageAspectRatio,
    defaultMarkerVisual: data.defaultMarkerVisual,
    markers: data.markers.map((marker) => ({
      id: marker.id,
      label: marker.label,
      visual: marker.visualOverride ?? data.defaultMarkerVisual,
    })),
    ...(accessibleLegend ? { accessibleLegend } : {}),
  };
}
