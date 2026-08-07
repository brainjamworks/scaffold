import { describe, expect, it, vi } from "vite-plus/test";

import {
  LearningEventSchema,
  type LearningEvent,
  type LearningEventPort,
} from "../../host/ports/learning-events";
import { LEARNING_EVENT_EXTENSIONS, buildLearningEventDraft } from "./catalogue";

const ROOT_ACTIVITY_ID = "https://lms.example.test/contents/fan-out-one";
const EVENT_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_TIMESTAMP = "2026-08-05T11:00:00.000Z";
const PROJECTION_REASON_CODES = [
  "meaning-unsupported",
  "destination-unavailable",
  "enrichment-rejected",
  "projector-exception",
  "invalid-projector-outcome",
] as const;
const TRUSTED_DESTINATION_IDS = Object.freeze({
  nativeLms: "destination-1",
  externalLrs: "destination-2",
  throwingProjector: "destination-3",
  acceptingProjector: "destination-4",
} as const);

type ProjectionReasonCode = (typeof PROJECTION_REASON_CODES)[number];
type TrustedDestinationId = (typeof TRUSTED_DESTINATION_IDS)[keyof typeof TRUSTED_DESTINATION_IDS];

const PROJECTION_REASON_CODE_SET: ReadonlySet<string> = new Set(PROJECTION_REASON_CODES);
const TRUSTED_DESTINATION_ID_SET: ReadonlySet<string> = new Set(
  Object.values(TRUSTED_DESTINATION_IDS),
);

type ProjectionOutcome =
  | { readonly status: "accepted" }
  | { readonly status: "unsupported"; readonly reasonCode: ProjectionReasonCode }
  | { readonly status: "retryable-failure"; readonly reasonCode: ProjectionReasonCode }
  | { readonly status: "permanent-failure"; readonly reasonCode: ProjectionReasonCode };

interface TestProjector {
  readonly destinationId: TrustedDestinationId;
  project(event: LearningEvent): ProjectionOutcome | Promise<ProjectionOutcome>;
}

interface SafeDiagnostic {
  readonly eventId: string;
  readonly destinationId: TrustedDestinationId;
  readonly reasonCode: ProjectionReasonCode;
}

interface ProjectionAttempt {
  readonly destinationId: TrustedDestinationId;
  readonly event: LearningEvent;
  readonly outcome: ProjectionOutcome;
}

interface TestProjectionHost {
  readonly port: LearningEventPort;
  readonly attempts: readonly ProjectionAttempt[];
  readonly diagnostics: readonly SafeDiagnostic[];
  retry(destinationId: TrustedDestinationId, eventId: string): Promise<void>;
}

function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || visited.has(value)) return value;
  visited.add(value);
  for (const child of Object.values(value)) deepFreeze(child, visited);
  return Object.freeze(value);
}

function expectDeeplyFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeeplyFrozen(child);
}

function canonicalEvent(): LearningEvent {
  return deepFreeze(
    LearningEventSchema.parse({
      ...buildLearningEventDraft(
        {
          type: "assessment.answered",
          targetId: "question-one",
          definition: {
            activityDescription: "Choose one answer",
            interaction: {
              kind: "single-select",
              options: [{ id: "option000001", label: "Visible option" }],
            },
          },
          response: { kind: "single-select", optionId: "option000001" },
          result: { isCorrect: true, score: { scaled: 1 } },
          attemptNumber: 1,
          quiz: { quizId: "quiz-one", attemptId: "PRIVATE_ATTEMPT_CONTEXT" },
        },
        { rootActivityId: ROOT_ACTIVITY_ID },
      ),
      id: EVENT_ID,
      timestamp: EVENT_TIMESTAMP,
    }),
  );
}

function safeReasonCode(reasonCode: unknown): ProjectionReasonCode {
  return typeof reasonCode === "string" && PROJECTION_REASON_CODE_SET.has(reasonCode)
    ? (reasonCode as ProjectionReasonCode)
    : "invalid-projector-outcome";
}

function createTestProjectionHost(projectors: readonly TestProjector[]): TestProjectionHost {
  for (const projector of projectors) {
    if (!TRUSTED_DESTINATION_ID_SET.has(projector.destinationId)) {
      throw new Error("destinationId must be a trusted configured identifier");
    }
  }

  const attempts: ProjectionAttempt[] = [];
  const diagnostics: SafeDiagnostic[] = [];
  const heldForRetry = new Map<
    string,
    { readonly event: LearningEvent; readonly projector: TestProjector }
  >();

  async function projectOne(projector: TestProjector, event: LearningEvent): Promise<void> {
    let outcome: ProjectionOutcome;
    try {
      outcome = await projector.project(event);
    } catch {
      outcome = { status: "permanent-failure", reasonCode: "projector-exception" };
    }

    attempts.push(Object.freeze({ destinationId: projector.destinationId, event, outcome }));
    const retryKey = `${projector.destinationId}:${event.id}`;
    if (outcome.status === "retryable-failure") {
      heldForRetry.set(retryKey, Object.freeze({ event, projector }));
    } else {
      heldForRetry.delete(retryKey);
    }
    if (outcome.status !== "accepted") {
      diagnostics.push(
        Object.freeze({
          eventId: event.id,
          destinationId: projector.destinationId,
          reasonCode: safeReasonCode(outcome.reasonCode),
        }),
      );
    }
  }

  const port: LearningEventPort = Object.freeze({
    rootActivityId: ROOT_ACTIVITY_ID,
    accept: async (event: LearningEvent) => {
      LearningEventSchema.parse(event);
      const original = JSON.stringify(event);
      await Promise.all(projectors.map((projector) => projectOne(projector, event)));
      if (JSON.stringify(event) !== original) {
        throw new Error("A projector mutated the canonical event");
      }
    },
  });

  return {
    port,
    attempts,
    diagnostics,
    retry: async (destinationId, eventId) => {
      const held = heldForRetry.get(`${destinationId}:${eventId}`);
      if (held === undefined) throw new Error("No retryable projection is held");
      await projectOne(held.projector, held.event);
    },
  };
}

describe("independent Learning Event projection", () => {
  it.each([
    { status: "accepted" },
    { status: "unsupported", reasonCode: "meaning-unsupported" },
    { status: "retryable-failure", reasonCode: "destination-unavailable" },
    { status: "permanent-failure", reasonCode: "enrichment-rejected" },
  ] satisfies readonly ProjectionOutcome[])(
    "runs accepted + $status without short-circuiting or mutation",
    async (secondOutcome) => {
      const event = canonicalEvent();
      const first = vi.fn<TestProjector["project"]>((received) => {
        expect(received).toBe(event);
        expectDeeplyFrozen(received);
        expect(() => {
          (received.result as { success: boolean }).success = false;
        }).toThrow();
        return { status: "accepted" };
      });
      const second = vi.fn<TestProjector["project"]>((received) => {
        expect(received).toBe(event);
        expectDeeplyFrozen(received);
        return secondOutcome;
      });
      const host = createTestProjectionHost([
        { destinationId: TRUSTED_DESTINATION_IDS.nativeLms, project: first },
        { destinationId: TRUSTED_DESTINATION_IDS.externalLrs, project: second },
      ]);
      const original = JSON.stringify(event);

      await host.port.accept(event);

      expect(first).toHaveBeenCalledOnce();
      expect(second).toHaveBeenCalledOnce();
      expect(first.mock.calls[0]?.[0]).toBe(event);
      expect(second.mock.calls[0]?.[0]).toBe(event);
      expect(host.attempts.map(({ outcome }) => outcome)).toContainEqual({ status: "accepted" });
      expect(host.attempts.map(({ outcome }) => outcome)).toContainEqual(secondOutcome);
      expect(JSON.stringify(event)).toBe(original);
    },
  );

  it("isolates a thrown projector from another destination", async () => {
    const event = canonicalEvent();
    const throwing = vi.fn<TestProjector["project"]>(() => {
      throw new Error("PRIVATE_PROJECTOR_RESPONSE");
    });
    const accepting = vi.fn<TestProjector["project"]>(() => ({ status: "accepted" }));
    const host = createTestProjectionHost([
      { destinationId: TRUSTED_DESTINATION_IDS.throwingProjector, project: throwing },
      { destinationId: TRUSTED_DESTINATION_IDS.acceptingProjector, project: accepting },
    ]);

    await expect(host.port.accept(event)).resolves.toBeUndefined();

    expect(throwing).toHaveBeenCalledOnce();
    expect(accepting).toHaveBeenCalledOnce();
    expect(host.attempts.map(({ outcome }) => outcome)).toStrictEqual([
      { status: "permanent-failure", reasonCode: "projector-exception" },
      { status: "accepted" },
    ]);
    expect(host.diagnostics).toStrictEqual([
      {
        eventId: EVENT_ID,
        destinationId: TRUSTED_DESTINATION_IDS.throwingProjector,
        reasonCode: "projector-exception",
      },
    ]);
    expect(JSON.stringify(host.diagnostics)).not.toContain("PRIVATE_PROJECTOR_RESPONSE");
  });

  it("retries the held canonical event without regenerating identity, time, or meaning", async () => {
    const event = canonicalEvent();
    let externalAttempt = 0;
    const native = vi.fn<TestProjector["project"]>(() => ({ status: "accepted" }));
    const external = vi.fn<TestProjector["project"]>(() => {
      externalAttempt += 1;
      return externalAttempt === 1
        ? { status: "retryable-failure", reasonCode: "destination-unavailable" }
        : { status: "accepted" };
    });
    const host = createTestProjectionHost([
      { destinationId: TRUSTED_DESTINATION_IDS.nativeLms, project: native },
      { destinationId: TRUSTED_DESTINATION_IDS.externalLrs, project: external },
    ]);
    const original = JSON.stringify(event);

    await host.port.accept(event);
    await host.retry(TRUSTED_DESTINATION_IDS.externalLrs, event.id);

    expect(native).toHaveBeenCalledOnce();
    expect(external).toHaveBeenCalledTimes(2);
    expect(external.mock.calls[0]?.[0]).toBe(event);
    expect(external.mock.calls[1]?.[0]).toBe(event);
    expect(external.mock.calls[1]?.[0]).toMatchObject({
      id: EVENT_ID,
      timestamp: EVENT_TIMESTAMP,
      verb: event.verb,
      object: event.object,
      result: event.result,
      context: event.context,
    });
    expect(JSON.stringify(external.mock.calls[1]?.[0])).toBe(original);
  });

  it("emits only safe diagnostic identifiers and codes", async () => {
    const event = canonicalEvent();
    const unsafeOutcome = {
      status: "retryable-failure",
      reasonCode: "PRIVATE_CREDENTIAL in reason",
      response: "PRIVATE_PROJECTOR_RESPONSE",
      actor: "PRIVATE_ACTOR",
      credential: "PRIVATE_CREDENTIAL",
      endpoint: "PRIVATE_ENDPOINT",
      rawEventJson: JSON.stringify(event),
      extensions: {
        [LEARNING_EVENT_EXTENSIONS.quizAttemptId]: "PRIVATE_ATTEMPT_CONTEXT",
      },
    } as unknown as ProjectionOutcome;
    const host = createTestProjectionHost([
      {
        destinationId: TRUSTED_DESTINATION_IDS.externalLrs,
        project: () => unsafeOutcome,
      },
    ]);

    await host.port.accept(event);

    expect(host.diagnostics).toStrictEqual([
      {
        eventId: EVENT_ID,
        destinationId: TRUSTED_DESTINATION_IDS.externalLrs,
        reasonCode: "invalid-projector-outcome",
      },
    ]);
    expect(Object.keys(host.diagnostics[0] ?? {}).sort()).toStrictEqual([
      "destinationId",
      "eventId",
      "reasonCode",
    ]);
    const serialized = JSON.stringify(host.diagnostics);
    for (const privateValue of [
      "option000001",
      "PRIVATE_PROJECTOR_RESPONSE",
      "PRIVATE_ATTEMPT_CONTEXT",
      "PRIVATE_ACTOR",
      "PRIVATE_CREDENTIAL",
      "PRIVATE_ENDPOINT",
      "rawEventJson",
      "extensions",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it.each([
    "learner-42",
    "records.example.test",
    "credential",
    "private-token",
    "actor-account-name",
  ])("rejects slug-shaped but untrusted destination identifier %s", (destinationId) => {
    expect(() =>
      createTestProjectionHost([
        {
          destinationId: destinationId as TrustedDestinationId,
          project: () => ({ status: "accepted" }),
        },
      ]),
    ).toThrow(/destinationId/u);
  });
});
