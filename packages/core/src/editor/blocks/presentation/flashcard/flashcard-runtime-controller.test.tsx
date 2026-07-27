// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { LearnerActivityPort, XapiPort } from "@/host/ports";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import {
  LearnerActivityReadinessGate,
  LearnerActivityRuntimeProvider,
} from "@/runtime/learner-activity/LearnerActivityRuntimeProvider";
import { XAPI_EXTENSIONS, XAPI_VERBS, XapiRuntimeProvider } from "@/runtime/xapi";

import {
  useFlashcardCardController,
  useFlashcardDeckController,
} from "./flashcard-runtime-controller";
import type { FlashcardDeckNodeLike } from "./flashcard-shared";

const deckNode: FlashcardDeckNodeLike = {
  childCount: 2,
  child(index) {
    return { attrs: { id: index === 0 ? "card-a" : "card-b" } };
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createPort() {
  const save = vi.fn<LearnerActivityPort["save"]>(async ({ record }) => ({
    ...record,
    updatedAt: "2026-07-20T08:00:00Z",
  }));
  const learnerActivityPort: LearnerActivityPort = {
    load: vi.fn(async () => null),
    save,
  };
  return { learnerActivityPort, save };
}

function createXapiPort() {
  const send = vi.fn<XapiPort["send"]>(async () => undefined);
  const xapiPort: XapiPort = {
    activityId: "https://lms.example.test/courses/flashcards-course",
    send,
  };
  return { xapiPort, send };
}

function RuntimeControllerProbe() {
  const deck = useFlashcardDeckController({
    blockId: "flashcard-one",
    deckNode,
  });
  const cardA = useFlashcardCardController({
    blockId: "flashcard-one",
    deckNode,
    cardId: "card-a",
  });
  const cardB = useFlashcardCardController({
    blockId: "flashcard-one",
    deckNode,
    cardId: "card-b",
  });

  return (
    <section>
      <output data-testid="flashcard-runtime-state">
        {JSON.stringify({
          currentCardId: deck.currentCardId,
          currentIndex: deck.currentIndex,
          currentFlipped: deck.currentFlipped,
          currentMastery: deck.currentMastery,
          masteredCount: deck.masteredCount,
          allMastered: deck.allMastered,
          cardA,
          cardB,
        })}
      </output>
      <button type="button" onClick={deck.goPrev}>
        Previous
      </button>
      <button type="button" onClick={deck.goNext}>
        Next
      </button>
      <button type="button" onClick={deck.flipCurrent}>
        Flip
      </button>
      <button type="button" onClick={cardA.flip}>
        Flip card A
      </button>
      <button type="button" onClick={() => deck.rateCurrent("gotIt")}>
        Got it
      </button>
      <button type="button" onClick={() => deck.rateCurrent("notYet")}>
        Not yet
      </button>
      <button type="button" onClick={deck.resetDeck}>
        Reset
      </button>
    </section>
  );
}

function renderRuntimeController(learnerActivityPort: LearnerActivityPort, xapiPort?: XapiPort) {
  return render(
    <ScaffoldServicesProvider
      ports={{ learnerActivity: learnerActivityPort, ...(xapiPort ? { xapi: xapiPort } : {}) }}
    >
      <ScaffoldArtifactIdentityProvider artifactId="artifact-one">
        <XapiRuntimeProvider>
          <LearnerActivityRuntimeProvider>
            <LearnerActivityReadinessGate>
              <RuntimeControllerProbe />
            </LearnerActivityReadinessGate>
          </LearnerActivityRuntimeProvider>
        </XapiRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>
    </ScaffoldServicesProvider>,
  );
}

function runtimeState(): unknown {
  return JSON.parse(screen.getByTestId("flashcard-runtime-state").textContent ?? "{}");
}

describe("flashcard runtime controller", () => {
  it("starts on the first authored card and persists navigation and flips", async () => {
    const user = userEvent.setup();
    const { learnerActivityPort, save } = createPort();

    renderRuntimeController(learnerActivityPort);

    await waitFor(() =>
      expect(runtimeState()).toMatchObject({
        currentCardId: "card-a",
        currentIndex: 0,
        currentFlipped: false,
        masteredCount: 0,
        allMastered: false,
        cardA: { flipped: false, isCurrent: true },
        cardB: { flipped: false, isCurrent: false },
      }),
    );
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        artifactId: "artifact-one",
        blockId: "flashcard-one",
        record: {
          activityKind: "flashcard",
          data: { currentCardId: null, flipped: {}, mastery: {} },
          completed: false,
        },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(runtimeState()).toMatchObject({
        currentCardId: "card-b",
        currentIndex: 1,
        cardA: { isCurrent: false },
        cardB: { isCurrent: true },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Flip" }));
    await waitFor(() =>
      expect(runtimeState()).toMatchObject({
        currentCardId: "card-b",
        currentFlipped: true,
        cardB: { flipped: true, isCurrent: true },
      }),
    );
    expect(save).toHaveBeenLastCalledWith({
      artifactId: "artifact-one",
      blockId: "flashcard-one",
      record: {
        activityKind: "flashcard",
        data: { currentCardId: "card-b", flipped: { "card-b": true }, mastery: {} },
        completed: false,
      },
    });
  });

  it("persists mastery, completion, and a full deck reset", async () => {
    const user = userEvent.setup();
    const { learnerActivityPort, save } = createPort();

    renderRuntimeController(learnerActivityPort);

    await waitFor(() => expect(runtimeState()).toMatchObject({ currentCardId: "card-a" }));
    await user.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() =>
      expect(runtimeState()).toMatchObject({
        currentCardId: "card-b",
        masteredCount: 1,
        allMastered: false,
        cardA: { mastery: "gotIt", isCurrent: false },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() =>
      expect(runtimeState()).toMatchObject({
        currentCardId: "card-b",
        masteredCount: 2,
        allMastered: true,
        cardB: { mastery: "gotIt", isCurrent: true },
      }),
    );
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith({
        artifactId: "artifact-one",
        blockId: "flashcard-one",
        record: {
          activityKind: "flashcard",
          data: {
            currentCardId: "card-b",
            flipped: {},
            mastery: { "card-a": "gotIt", "card-b": "gotIt" },
          },
          completed: true,
        },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(runtimeState()).toMatchObject({
        currentCardId: "card-a",
        masteredCount: 0,
        allMastered: false,
        cardA: { flipped: false, isCurrent: true },
        cardB: { flipped: false, isCurrent: false },
      }),
    );
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith({
        artifactId: "artifact-one",
        blockId: "flashcard-one",
        record: {
          activityKind: "flashcard",
          data: { currentCardId: null, flipped: {}, mastery: {} },
          completed: false,
        },
      }),
    );
  });

  it("applies learner keyboard shortcuts through the persistence seam", async () => {
    const user = userEvent.setup();
    const { learnerActivityPort, save } = createPort();

    renderRuntimeController(learnerActivityPort);

    await waitFor(() => expect(runtimeState()).toMatchObject({ currentCardId: "card-a" }));
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(runtimeState()).toMatchObject({ currentCardId: "card-b" }));

    await user.keyboard(" ");
    await waitFor(() => expect(runtimeState()).toMatchObject({ currentFlipped: true }));

    await user.keyboard("g");
    await waitFor(() =>
      expect(runtimeState()).toMatchObject({
        currentCardId: "card-a",
        currentFlipped: false,
        masteredCount: 1,
        allMastered: false,
        cardB: { flipped: false, mastery: "gotIt", isCurrent: false },
      }),
    );
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith({
        artifactId: "artifact-one",
        blockId: "flashcard-one",
        record: {
          activityKind: "flashcard",
          data: {
            currentCardId: "card-a",
            flipped: { "card-b": false },
            mastery: { "card-b": "gotIt" },
          },
          completed: false,
        },
      }),
    );
  });

  it("emits the accepted face from both flashcard flip controls", async () => {
    const user = userEvent.setup();
    const { learnerActivityPort, save } = createPort();
    const { xapiPort, send } = createXapiPort();

    renderRuntimeController(learnerActivityPort, xapiPort);

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: /^Flip$/u }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      verb: XAPI_VERBS.interacted,
      result: {
        extensions: {
          [XAPI_EXTENSIONS.learnerActivityEvent]: {
            action: "card-flipped",
            cardId: "card-a",
            face: "back",
          },
        },
      },
    });

    await user.click(screen.getByRole("button", { name: "Flip card A" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    expect(send.mock.calls[2]?.[0]).toMatchObject({
      verb: XAPI_VERBS.interacted,
      result: {
        extensions: {
          [XAPI_EXTENSIONS.learnerActivityEvent]: {
            action: "card-flipped",
            cardId: "card-a",
            face: "front",
          },
        },
      },
    });
  });

  it("emits accepted ratings with deck progress and terminal completion", async () => {
    const user = userEvent.setup();
    const { learnerActivityPort, save } = createPort();
    const { xapiPort, send } = createXapiPort();

    renderRuntimeController(learnerActivityPort, xapiPort);

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Not yet" }));
    await waitFor(() => expect(runtimeState()).toMatchObject({ currentCardId: "card-b" }));
    await user.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() =>
      expect(runtimeState()).toMatchObject({
        currentCardId: "card-a",
        masteredCount: 1,
        allMastered: false,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Got it" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(5));
    expect(send.mock.calls.slice(1).map(([statement]) => statement)).toMatchObject([
      {
        verb: XAPI_VERBS.interacted,
        result: {
          extensions: {
            [XAPI_EXTENSIONS.learnerActivityEvent]: {
              action: "card-rated",
              cardId: "card-a",
              rating: "not-yet",
              masteredCount: 0,
              total: 2,
            },
          },
        },
      },
      {
        verb: XAPI_VERBS.interacted,
        result: {
          extensions: {
            [XAPI_EXTENSIONS.learnerActivityEvent]: {
              action: "card-rated",
              cardId: "card-b",
              rating: "got-it",
              masteredCount: 1,
              total: 2,
            },
          },
        },
      },
      {
        verb: XAPI_VERBS.interacted,
        result: {
          extensions: {
            [XAPI_EXTENSIONS.learnerActivityEvent]: {
              action: "card-rated",
              cardId: "card-a",
              rating: "got-it",
              masteredCount: 2,
              total: 2,
            },
          },
        },
      },
      {
        verb: XAPI_VERBS.completed,
        result: { completion: true },
      },
    ]);
  });
});
