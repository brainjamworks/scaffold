import type { EmbeddedNodeId } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  MountedSemanticActivationBinding,
  SemanticActivationOutcome,
  SemanticActivationRequest,
  SemanticInteractionOrigin,
} from "./semantic-target-interaction";
import { createSemanticActivationRegistry } from "./semantic-activation-registry";

const OWNER_ID = "owner000001" as EmbeddedNodeId;
const OTHER_OWNER_ID = "owner000002" as EmbeddedNodeId;
const CHILD_ID = "child000001" as EmbeddedNodeId;

describe("SemanticActivationRegistry", () => {
  it("resolves only the exact mounted owner", () => {
    const registry = createSemanticActivationRegistry();
    const binding = activationBinding(OWNER_ID);

    registry.register(binding);

    expect(registry.resolve(OWNER_ID)).toEqual({ kind: "resolved", binding });
    expect(registry.resolve(OTHER_OWNER_ID)).toEqual({
      kind: "unavailable",
      ownerId: OTHER_OWNER_ID,
      reason: "owner-unmounted",
    });
  });

  it("lets a stale unregister callback remove only its matching live binding", () => {
    const registry = createSemanticActivationRegistry();
    const first = activationBinding(OWNER_ID);
    const second = activationBinding(OWNER_ID);
    const unregisterFirst = registry.register(first);

    unregisterFirst();
    const unregisterSecond = registry.register(second);
    unregisterFirst();

    expect(registry.resolve(OWNER_ID)).toEqual({ kind: "resolved", binding: second });
    unregisterSecond();
    expect(registry.resolve(OWNER_ID)).toEqual({
      kind: "unavailable",
      ownerId: OWNER_ID,
      reason: "owner-unmounted",
    });
  });

  it("isolates bindings with the same owner between mounted environments", () => {
    const firstEnvironment = createSemanticActivationRegistry();
    const secondEnvironment = createSemanticActivationRegistry();
    const firstBinding = activationBinding(OWNER_ID);
    const secondBinding = activationBinding(OWNER_ID);

    firstEnvironment.register(firstBinding);
    secondEnvironment.register(secondBinding);

    expect(firstEnvironment.resolve(OWNER_ID)).toEqual({
      kind: "resolved",
      binding: firstBinding,
    });
    expect(secondEnvironment.resolve(OWNER_ID)).toEqual({
      kind: "resolved",
      binding: secondBinding,
    });
  });

  it("throws when two live bindings claim the same owner", () => {
    const registry = createSemanticActivationRegistry();
    registry.register(activationBinding(OWNER_ID));

    expect(() => registry.register(activationBinding(OWNER_ID))).toThrow(
      `Duplicate semantic activation binding for owner "${OWNER_ID}"`,
    );
  });

  it("disposes idempotently and throws when registration follows disposal", () => {
    const registry = createSemanticActivationRegistry();
    const unregister = registry.register(activationBinding(OWNER_ID));

    registry.dispose();
    registry.dispose();
    unregister();

    expect(registry.resolve(OWNER_ID)).toEqual({
      kind: "unavailable",
      ownerId: OWNER_ID,
      reason: "owner-unmounted",
    });
    expect(() => registry.register(activationBinding(OTHER_OWNER_ID))).toThrow(
      "Cannot register a semantic activation binding after registry disposal",
    );
  });

  it("passes all origins through and preserves every reason-specific binding outcome", async () => {
    const origins = [
      "document-outline",
      "presentation-timeline",
      "author-preview",
      "configured-presentation",
    ] as const satisfies readonly SemanticInteractionOrigin[];
    const bindingFacts = { ownerId: OWNER_ID, childId: CHILD_ID } as const;
    const outcomes = [
      { kind: "revealed", ...bindingFacts },
      { kind: "already-visible", ...bindingFacts },
      { kind: "refused", ...bindingFacts, reason: "authority-boundary" },
      { kind: "refused", ...bindingFacts, reason: "origin-not-supported" },
      { kind: "refused", ...bindingFacts, reason: "learner-interaction-precedence" },
      { kind: "unavailable", ...bindingFacts, reason: "owner-unmounted" },
      { kind: "unavailable", ...bindingFacts, reason: "child-missing" },
      { kind: "unavailable", ...bindingFacts, reason: "temporarily-unavailable" },
      { kind: "interrupted", ...bindingFacts },
    ] as const satisfies readonly SemanticActivationOutcome[];
    let nextOutcome: SemanticActivationOutcome = outcomes[0];
    const activate = vi.fn(async (_request: SemanticActivationRequest) => nextOutcome);
    const registry = createSemanticActivationRegistry();
    registry.register({ ownerId: OWNER_ID, activate });
    const resolution = registry.resolve(OWNER_ID);
    if (resolution.kind !== "resolved") throw new Error("expected mounted binding");

    for (const [index, expected] of outcomes.entries()) {
      nextOutcome = expected;
      const origin = origins[index % origins.length]!;
      const request = activationRequest(origin);

      await expect(resolution.binding.activate(request)).resolves.toBe(expected);
      expect(activate).toHaveBeenLastCalledWith(request);
    }

    expect(activate.mock.calls.map(([request]) => request.origin)).toEqual(
      outcomes.map((_, index) => origins[index % origins.length]),
    );
  });

  it("keeps binding defects observable", async () => {
    const defect = new Error("broken mounted authority");
    const registry = createSemanticActivationRegistry();
    registry.register({
      ownerId: OWNER_ID,
      activate: async () => {
        throw defect;
      },
    });
    const resolution = registry.resolve(OWNER_ID);
    if (resolution.kind !== "resolved") throw new Error("expected mounted binding");

    await expect(
      resolution.binding.activate(activationRequest("document-outline")),
    ).rejects.toBe(defect);
  });
});

function activationBinding(ownerId: EmbeddedNodeId): MountedSemanticActivationBinding {
  return {
    ownerId,
    activate: async (request) => ({
      kind: "already-visible",
      ownerId,
      childId: request.relationship.childId,
    }),
  };
}

function activationRequest(origin: SemanticInteractionOrigin): SemanticActivationRequest {
  return {
    requestedId: CHILD_ID,
    relationship: {
      ownerId: OWNER_ID,
      childId: CHILD_ID,
      ownerKind: "block",
    },
    origin,
    causationId: "test-causation",
    signal: new AbortController().signal,
  };
}
