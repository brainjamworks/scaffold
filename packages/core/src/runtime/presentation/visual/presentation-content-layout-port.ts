import type { Result as ResultType } from "better-result";
import type {
  EmbeddedNodeId,
  PresentationContentLayout,
} from "@scaffold/contracts";

import type {
  ContentLayoutProjectionInput,
  ContentLayoutProjectionIssue,
} from "@/editor/content-layout/model/content-layout-projection";

export interface PresentationContentLayoutRequest {
  readonly surfaceId: EmbeddedNodeId;
  readonly containers: readonly ContentLayoutProjectionInput[];
}

export type PresentationContentLayoutError =
  | {
      readonly reason: "surface-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly currentSurfaceIds: readonly EmbeddedNodeId[];
    }
  | {
      readonly reason: "container-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly containerId: EmbeddedNodeId;
      readonly currentSurfaceId: EmbeddedNodeId | null;
    }
  | {
      readonly reason: "content-layout-changed";
      readonly surfaceId: EmbeddedNodeId;
      readonly containerId: EmbeddedNodeId;
      readonly expectedContentLayout: PresentationContentLayout;
      readonly currentContentLayout: PresentationContentLayout;
    }
  | {
      readonly reason: "direct-children-changed";
      readonly surfaceId: EmbeddedNodeId;
      readonly containerId: EmbeddedNodeId;
      readonly expectedDirectChildIds: readonly EmbeddedNodeId[];
      readonly currentDirectChildIds: readonly EmbeddedNodeId[];
    }
  | {
      readonly reason: "projection-refused";
      readonly surfaceId: EmbeddedNodeId;
      readonly containerId: EmbeddedNodeId;
      readonly issue: ContentLayoutProjectionIssue;
    };

export type PresentationContentLayoutResult = ResultType<void, PresentationContentLayoutError>;

export interface PresentationContentLayoutPort {
  apply(request: PresentationContentLayoutRequest): PresentationContentLayoutResult;
  clear(): void;
}
