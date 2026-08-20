import { PresentationContentLayout, PresentationContentLayoutSchema } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  EXCLUSIVE_FILL_OCCUPANCY_POLICY,
  SHARED_FILL_OCCUPANCY_POLICY,
  type BoundedContainerOccupancyPolicy,
} from "@/editor/bounded-containers/model/bounded-container-placement";

import { CONTENT_LAYOUT_ATTR } from "./content-layout-attribute";

export function resolveBoundedContainerOccupancyPolicy(
  container: ProseMirrorNode,
): BoundedContainerOccupancyPolicy {
  const contentLayout = PresentationContentLayoutSchema.parse(container.attrs[CONTENT_LAYOUT_ATTR]);

  switch (contentLayout) {
    case PresentationContentLayout.Flow:
      return EXCLUSIVE_FILL_OCCUPANCY_POLICY;
    case PresentationContentLayout.Sequence:
      return SHARED_FILL_OCCUPANCY_POLICY;
  }
}
