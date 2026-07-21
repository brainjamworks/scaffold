import {
  prepareScaffoldArtifactForAuthoring,
  type PreparedScaffoldArtifact,
} from "@scaffold/core/format";
import type { ScaffoldAuthoringArtifact } from "@scaffold/core/ports";

import type { ScaffoldXBlockInnerInitPayload } from "../types";

export type XBlockArtifactState =
  | {
      status: "ready";
      artifact: Extract<PreparedScaffoldArtifact, { status: "ready" }>["artifact"];
    }
  | {
      status: "empty";
    }
  | {
      status: "error";
      message: string;
    };

export function prepareXBlockArtifact(
  artifact: ScaffoldXBlockInnerInitPayload["artifact"],
): XBlockArtifactState {
  const preparedArtifact = prepareScaffoldArtifactForAuthoring(artifact);
  if (preparedArtifact.status === "error") {
    return { status: "error", message: preparedArtifact.message };
  }
  if (preparedArtifact.status === "uninitialized") {
    return { status: "empty" };
  }

  return {
    status: "ready",
    artifact: preparedArtifact.artifact satisfies ScaffoldAuthoringArtifact,
  };
}
