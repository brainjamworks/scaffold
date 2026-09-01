import { PresentationContentLayout, type EmbeddedNodeId } from "@scaffold/contracts";

export interface ContentLayoutProjectionInput {
  readonly containerId: EmbeddedNodeId;
  readonly contentLayout: PresentationContentLayout;
  readonly directChildIds: readonly EmbeddedNodeId[];
  readonly activeChildId: EmbeddedNodeId | null;
  readonly withheldChildIds?: readonly EmbeddedNodeId[];
}

export interface DirectChildContentLayoutState {
  readonly childId: EmbeddedNodeId;
  readonly availability: "normal" | "withheld" | "available";
  readonly layoutParticipation: "normal" | "shared-position";
  readonly interaction: "enabled" | "inert";
  readonly accessibility: "exposed" | "hidden";
}

export type ContentLayoutProjectionIssue =
  | {
      readonly kind: "duplicate-direct-child-id";
      readonly containerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
    }
  | {
      readonly kind: "missing-active-child";
      readonly containerId: EmbeddedNodeId;
    }
  | {
      readonly kind: "active-child-on-empty-sequence";
      readonly containerId: EmbeddedNodeId;
      readonly activeChildId: EmbeddedNodeId;
    }
  | {
      readonly kind: "active-child-not-direct";
      readonly containerId: EmbeddedNodeId;
      readonly activeChildId: EmbeddedNodeId;
    }
  | {
      readonly kind: "duplicate-withheld-child-id";
      readonly containerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
    }
  | {
      readonly kind: "withheld-child-not-direct";
      readonly containerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
    };

export type ContentLayoutProjectionOutcome =
  | {
      readonly kind: "flow";
      readonly containerId: EmbeddedNodeId;
      readonly childStates: readonly DirectChildContentLayoutState[];
    }
  | {
      readonly kind: "empty-sequence";
      readonly containerId: EmbeddedNodeId;
      readonly childStates: readonly [];
    }
  | {
      readonly kind: "projected-sequence";
      readonly containerId: EmbeddedNodeId;
      readonly childStates: readonly DirectChildContentLayoutState[];
    }
  | {
      readonly kind: "projection-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly issue: ContentLayoutProjectionIssue;
    };

export function projectContentLayout(
  input: ContentLayoutProjectionInput,
): ContentLayoutProjectionOutcome {
  const duplicateChildId = findDuplicateChildId(input.directChildIds);
  if (duplicateChildId !== null) {
    const issue = Object.freeze({
      kind: "duplicate-direct-child-id" as const,
      containerId: input.containerId,
      childId: duplicateChildId,
    });
    return Object.freeze({
      kind: "projection-unavailable" as const,
      containerId: input.containerId,
      issue,
    });
  }

  const withheldChildIds = input.withheldChildIds ?? [];
  const duplicateWithheldChildId = findDuplicateChildId(withheldChildIds);
  if (duplicateWithheldChildId !== null) {
    return unavailable(input.containerId, {
      kind: "duplicate-withheld-child-id",
      containerId: input.containerId,
      childId: duplicateWithheldChildId,
    });
  }
  const withheldChildNotDirect = withheldChildIds.find(
    (childId) => !input.directChildIds.includes(childId),
  );
  if (withheldChildNotDirect !== undefined) {
    return unavailable(input.containerId, {
      kind: "withheld-child-not-direct",
      containerId: input.containerId,
      childId: withheldChildNotDirect,
    });
  }

  switch (input.contentLayout) {
    case PresentationContentLayout.Flow: {
      const withheld = new Set(withheldChildIds);
      const childStates = Object.freeze(
        input.directChildIds.map((childId) =>
          withheld.has(childId) ? createFlowWithheldState(childId) : createNormalState(childId),
        ),
      );
      return Object.freeze({
        kind: "flow" as const,
        containerId: input.containerId,
        childStates,
      });
    }
    case PresentationContentLayout.Sequence: {
      if (input.directChildIds.length === 0) {
        if (input.activeChildId !== null) {
          const issue = Object.freeze({
            kind: "active-child-on-empty-sequence" as const,
            containerId: input.containerId,
            activeChildId: input.activeChildId,
          });
          return Object.freeze({
            kind: "projection-unavailable" as const,
            containerId: input.containerId,
            issue,
          });
        }

        const childStates = Object.freeze([]) as readonly [];
        return Object.freeze({
          kind: "empty-sequence" as const,
          containerId: input.containerId,
          childStates,
        });
      }

      if (input.activeChildId === null) {
        const issue = Object.freeze({
          kind: "missing-active-child" as const,
          containerId: input.containerId,
        });
        return Object.freeze({
          kind: "projection-unavailable" as const,
          containerId: input.containerId,
          issue,
        });
      }

      if (!input.directChildIds.includes(input.activeChildId)) {
        const issue = Object.freeze({
          kind: "active-child-not-direct" as const,
          containerId: input.containerId,
          activeChildId: input.activeChildId,
        });
        return Object.freeze({
          kind: "projection-unavailable" as const,
          containerId: input.containerId,
          issue,
        });
      }

      const childStates = Object.freeze(
        input.directChildIds.map((childId) =>
          childId === input.activeChildId
            ? createAvailableState(childId)
            : createWithheldState(childId),
        ),
      );
      return Object.freeze({
        kind: "projected-sequence" as const,
        containerId: input.containerId,
        childStates,
      });
    }
    default: {
      return assertNeverContentLayout(input.contentLayout);
    }
  }
}

function unavailable(
  containerId: EmbeddedNodeId,
  issue: ContentLayoutProjectionIssue,
): ContentLayoutProjectionOutcome {
  return Object.freeze({
    kind: "projection-unavailable" as const,
    containerId,
    issue: Object.freeze(issue),
  });
}

function assertNeverContentLayout(value: never): never {
  void value;
  throw new Error("Unsupported content layout");
}

function findDuplicateChildId(childIds: readonly EmbeddedNodeId[]): EmbeddedNodeId | null {
  const seenChildIds = new Set<EmbeddedNodeId>();
  for (const childId of childIds) {
    if (seenChildIds.has(childId)) return childId;
    seenChildIds.add(childId);
  }
  return null;
}

function createNormalState(childId: EmbeddedNodeId): DirectChildContentLayoutState {
  return Object.freeze({
    childId,
    availability: "normal" as const,
    layoutParticipation: "normal" as const,
    interaction: "enabled" as const,
    accessibility: "exposed" as const,
  });
}

function createAvailableState(childId: EmbeddedNodeId): DirectChildContentLayoutState {
  return Object.freeze({
    childId,
    availability: "available" as const,
    layoutParticipation: "shared-position" as const,
    interaction: "enabled" as const,
    accessibility: "exposed" as const,
  });
}

function createFlowWithheldState(childId: EmbeddedNodeId): DirectChildContentLayoutState {
  return Object.freeze({
    childId,
    availability: "withheld" as const,
    layoutParticipation: "normal" as const,
    interaction: "inert" as const,
    accessibility: "hidden" as const,
  });
}

function createWithheldState(childId: EmbeddedNodeId): DirectChildContentLayoutState {
  return Object.freeze({
    childId,
    availability: "withheld" as const,
    layoutParticipation: "shared-position" as const,
    interaction: "inert" as const,
    accessibility: "hidden" as const,
  });
}
