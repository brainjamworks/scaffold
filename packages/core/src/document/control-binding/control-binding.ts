import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Result as ResultType } from "better-result";

import type {
  ControlCommandType,
  ControlEventType,
  ControlStateKey,
  ControlValue,
} from "./control-definition";

export interface ControlEvent {
  readonly targetId: EmbeddedNodeId;
  readonly type: ControlEventType;
}

export type ControlEventListener = (event: ControlEvent) => void;

/** Publishes committed learner-caused events without replay; cleanup is idempotent. */
export interface EventSource {
  subscribe(listener: ControlEventListener): () => void;
}

export interface ControlStateReadRequest {
  readonly targetId: EmbeddedNodeId;
  readonly key: ControlStateKey;
}

/** Reads current declared state synchronously and without side effects. */
export interface StateReader {
  read(request: ControlStateReadRequest): ControlValue;
}

export interface ControlCommandRequest {
  readonly targetId: EmbeddedNodeId;
  readonly type: ControlCommandType;
  readonly input?: ControlValue;
  readonly signal: AbortSignal;
}

export type ControlCommandError =
  | {
      readonly reason: "cancelled";
    }
  | {
      readonly reason: "playback-not-allowed";
    }
  | {
      readonly reason: "media-unavailable";
      readonly mediaErrorCode: number | null;
    }
  | {
      readonly reason: "seek-out-of-range";
      readonly requestedSeconds: number;
      readonly durationSeconds: number;
    }
  | {
      readonly reason: "page-out-of-range";
      readonly requestedPage: number;
      readonly pageCount: number;
    }
  | {
      readonly reason: "pdf-unavailable";
      readonly requestedPage: number;
    };

export type ControlCommandResult = ResultType<void, ControlCommandError>;

/** Executes a programmatic request; success means the feature authority committed it. */
export interface CommandExecutor {
  execute(request: ControlCommandRequest): Promise<ControlCommandResult>;
}

/** Adapts one mounted owner and its declared children without owning feature state. */
export interface ControlBinding {
  readonly ownerId: EmbeddedNodeId;
  readonly eventSource?: EventSource;
  readonly stateReader?: StateReader;
  readonly commandExecutor?: CommandExecutor;
}

/** Tracks editor-scoped mounted membership; absence from `get` is not an execution result. */
export interface ControlBindingRegistry {
  register(binding: ControlBinding): () => void;
  get(ownerId: EmbeddedNodeId): ControlBinding | undefined;
  /** Calls once when every unique requested owner is mounted; cleanup cancels unresolved delivery. */
  notifyWhenOwnersMounted(ownerIds: readonly EmbeddedNodeId[], listener: () => void): () => void;
  dispose(): void;
}
