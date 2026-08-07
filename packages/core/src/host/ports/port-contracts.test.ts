import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import { SCAFFOLD_MEDIA_CONTEXTS, type MediaPort } from "./media";
import {
  AssessmentLearnerSnapshotSchema,
  LearnerActivitySnapshotSchema,
  QuizAttemptStateSchema,
  type QuizAttemptState,
} from "@scaffold/contracts";

import type {
  ArtifactPersistencePort,
  AssessmentProblemCommandOutcome,
  AssessmentPort,
  QuizFinishAttemptRequest,
  QuizRevealAnswersRequest,
  QuizStartAttemptRequest,
  QuizSubmitQuestionRequest,
  ScaffoldRuntimePorts,
  LearningEvent,
  LearningEventPort,
} from "@/host/ports";
import type {
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringEntryHostServices,
  ScaffoldLearnerBootstrap,
  ScaffoldLearnerHostServices,
} from "@/host/contracts";
import type { ScaffoldArtifactCreationPort } from "./artifact-creation";

const successfulProblemOutcome: AssessmentProblemCommandOutcome = {
  problem: {
    response: null,
    attemptNumber: 1,
    hintsShown: 0,
    checkResult: null,
    submitted: true,
    submissionResult: {
      isCorrect: true,
      score: { scaled: 1 },
      feedback: null,
      items: {},
    },
  },
};

const TARGET_ID = "target000001";
const OPTION_ID = "option000001";
const QUIZ_GROUP_ID = "artifact:artifact-1/group:quiz00000001";
const SECOND_QUIZ_GROUP_ID = "artifact:artifact-1/group:quiz00000002";
const PROBLEM_ID = "artifact:artifact-1/block:target000001";

describe("host app contracts", () => {
  it("keeps authoring bootstrap separate from learner bootstrap", () => {
    const artifact = {
      id: "artifact-1",
      title: "Artifact title",
      mode: "page",
      content: { type: "doc", content: [] },
    } satisfies ScaffoldAuthoringArtifact;

    const assessmentSnapshot = {
      snapshotVersion: 2,
      artifactId: artifact.id,
      problems: {
        [TARGET_ID]: {
          response: { kind: "single-select", optionId: OPTION_ID },
          submitted: true,
          attemptNumber: 1,
          hintsShown: 0,
          checkResult: null,
          submissionResult: {
            isCorrect: true,
            score: { scaled: 1 },
            feedback: null,
            items: {},
          },
        },
      },
      quizzes: {},
    } as const;

    const learnerBootstrap = {
      artifactId: artifact.id,
      title: artifact.title,
      mode: artifact.mode,
      learnerContent: artifact.content,
      initialLearnerState: {
        assessmentSnapshot,
        learnerActivitySnapshot: {
          snapshotVersion: 1,
          artifactId: artifact.id,
          activities: {},
        },
      },
    } satisfies ScaffoldLearnerBootstrap;

    expect(artifact.id).toBe("artifact-1");
    expect(learnerBootstrap).not.toHaveProperty("artifact");
    expect(learnerBootstrap).not.toHaveProperty("assessmentTargets");
    expect(learnerBootstrap).not.toHaveProperty("assessmentGroups");
    expect(
      AssessmentLearnerSnapshotSchema.parse(
        learnerBootstrap.initialLearnerState?.assessmentSnapshot,
      ),
    ).toStrictEqual(assessmentSnapshot);
    expect(
      LearnerActivitySnapshotSchema.parse(
        learnerBootstrap.initialLearnerState?.learnerActivitySnapshot,
      ),
    ).toStrictEqual(learnerBootstrap.initialLearnerState?.learnerActivitySnapshot);
  });

  it("scopes host services by authoring and learner responsibilities", async () => {
    const artifactPersistence = {
      saveArtifact: async () => undefined,
    } satisfies ArtifactPersistencePort;
    const artifactCreation = {
      createArtifactMetadata: async () => ({
        id: "artifact-1",
        title: "Untitled",
      }),
    } satisfies ScaffoldArtifactCreationPort;

    const authoringServices = {
      artifactPersistence,
      artifactCreation,
      media: null,
    } satisfies ScaffoldAuthoringEntryHostServices;

    const assessment: AssessmentPort = {
      type: "preview",
      submit: async () => successfulProblemOutcome,
    };
    const learningEvents = {
      rootActivityId: "https://learning.example.test/artifacts/artifact-1",
      accept: async () => undefined,
    } satisfies LearningEventPort;

    const learnerServices = {
      assessment,
      learnerActivity: {
        load: async () => null,
        save: async ({ record }) => ({
          ...record,
          updatedAt: "2026-07-17T08:00:00Z",
        }),
      },
      media: null,
      learningEvents,
    } satisfies ScaffoldLearnerHostServices;

    expect(authoringServices.artifactPersistence).toBe(artifactPersistence);
    expect(learnerServices.learningEvents).toBe(learningEvents);
    expectTypeOf<
      "learningEvents" extends keyof ScaffoldAuthoringEntryHostServices ? true : false
    >().toEqualTypeOf<false>();
    await expect(
      learnerServices.assessment?.submit({
        problemId: PROBLEM_ID,
        targetId: TARGET_ID,
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: OPTION_ID },
        expectedAttemptNumber: 0,
      }),
    ).resolves.toMatchObject({ problem: { submissionResult: { isCorrect: true } } });
  });
});

describe("Learning Event port contract", () => {
  it("allows runtime hosts to omit the capability entirely", () => {
    const runtimePorts = {} satisfies ScaffoldRuntimePorts;
    const learnerServices = {} satisfies ScaffoldLearnerHostServices;

    expect(runtimePorts).not.toHaveProperty("learningEvents");
    expect(learnerServices).not.toHaveProperty("learningEvents");
  });

  it("defines one optional ordered event-acceptance seam", async () => {
    const event: LearningEvent = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      timestamp: "2026-07-25T10:15:30.123Z",
      verb: {
        id: "https://w3id.org/xapi/adl/verbs/initialized",
        display: { "en-GB": "initialized" },
      },
      object: {
        objectType: "Activity",
        id: "https://learning.example.test/courses/artifact-1",
      },
    };
    const accepted: LearningEvent[] = [];
    const learningEvents = {
      rootActivityId: event.object.id,
      accept: async (acceptedEvent: LearningEvent) => {
        accepted.push(acceptedEvent);
      },
    } satisfies LearningEventPort;
    const runtimePorts = { learningEvents } satisfies ScaffoldRuntimePorts;
    const learnerServices = { learningEvents } satisfies ScaffoldLearnerHostServices;

    await learningEvents.accept(event);

    expect(accepted).toStrictEqual([event]);
    expect(runtimePorts.learningEvents).toBe(learningEvents);
    expect(learnerServices.learningEvents).toBe(learningEvents);
  });
});

describe("media port contract", () => {
  it("defines host media contexts shared by adapters", async () => {
    expect(SCAFFOLD_MEDIA_CONTEXTS).toEqual(["authoring", "preview", "runtime"]);

    const port = {
      context: "preview",
      resolve: async (mediaId: string) => `resolved:${mediaId}`,
      upload: async () => ({
        id: "media-1",
        url: "resolved:media-1",
        mediaType: "image",
        fileName: "image.png",
        mimeType: "image/png",
        size: 12,
      }),
    } satisfies MediaPort;

    await expect(port.resolve("media-1")).resolves.toBe("resolved:media-1");
    expect(port.context).toBe("preview");
  });
});

describe("assessment port contracts", () => {
  it("keeps quiz methods optional on assessment ports", () => {
    const port: AssessmentPort = {
      type: "runtime",
      submit: async () => successfulProblemOutcome,
    };

    expect(port.quiz).toBeUndefined();
  });

  it("types quiz attempt port methods under assessment port", async () => {
    const attempt: QuizAttemptState = {
      attemptId: "attempt-1",
      groupId: QUIZ_GROUP_ID,
      status: "in_progress",
      currentTargetId: TARGET_ID,
      submittedTargetIds: [],
      startedAt: "2026-06-18T08:00:00.000Z",
      finishedAt: null,
      expiresAt: null,
      score: null,
      successStatus: null,
      resultsByTargetId: {},
      answerReviewAuthorized: false,
    };
    const port = {
      type: "runtime",
      submit: async () => successfulProblemOutcome,
      quiz: {
        startAttempt: async (args: QuizStartAttemptRequest) => ({
          quizAttempt: { ...attempt, groupId: args.groupId },
          problemsByTargetId: {},
        }),
        submitQuestion: async (args: QuizSubmitQuestionRequest) => ({
          quizAttempt: {
            ...attempt,
            currentTargetId: args.targetId,
            submittedTargetIds: [args.targetId],
          },
          problemsByTargetId: {},
        }),
        finishAttempt: async (args: QuizFinishAttemptRequest) => ({
          quizAttempt: {
            ...attempt,
            attemptId: args.attemptId,
            status: "completed",
            finishedAt: "2026-06-18T08:05:00.000Z",
            score: { scaled: 1 },
            successStatus: null,
          },
          problemsByTargetId: {},
        }),
        revealAnswers: async (args: QuizRevealAnswersRequest) => ({
          quizAttempt: { ...attempt, attemptId: args.attemptId, answerReviewAuthorized: true },
          problemsByTargetId: {},
        }),
      },
    } satisfies AssessmentPort;

    await expect(
      port.quiz.startAttempt({
        groupId: SECOND_QUIZ_GROUP_ID,
      }),
    ).resolves.toMatchObject({ quizAttempt: { groupId: SECOND_QUIZ_GROUP_ID } });
    await expect(
      port.quiz.submitQuestion({
        attemptId: "attempt-1",
        groupId: QUIZ_GROUP_ID,
        targetId: TARGET_ID,
        response: { kind: "single-select", optionId: OPTION_ID },
        expectedAttemptNumber: 0,
      }),
    ).resolves.toMatchObject({ quizAttempt: { submittedTargetIds: [TARGET_ID] } });
    await expect(
      port.quiz.finishAttempt({
        attemptId: "attempt-1",
        groupId: QUIZ_GROUP_ID,
        responsesByTargetId: {
          [TARGET_ID]: { kind: "single-select", optionId: OPTION_ID },
        },
      }),
    ).resolves.toMatchObject({ quizAttempt: { status: "completed" } });
    await expect(
      port.quiz.revealAnswers?.({
        attemptId: "attempt-1",
        groupId: QUIZ_GROUP_ID,
      }),
    ).resolves.toMatchObject({ quizAttempt: { answerReviewAuthorized: true } });
  });

  it("validates quiz attempt state at port boundaries", () => {
    expect(
      QuizAttemptStateSchema.parse({
        attemptId: "attempt-1",
        groupId: QUIZ_GROUP_ID,
        status: "completed",
        currentTargetId: null,
        submittedTargetIds: [TARGET_ID],
        startedAt: "2026-06-18T08:00:00.000Z",
        finishedAt: "2026-06-18T08:05:00.000Z",
        expiresAt: null,
        score: { scaled: 1 },
        successStatus: null,
        resultsByTargetId: {
          [TARGET_ID]: {
            isCorrect: true,
            score: { scaled: 1 },
            feedback: null,
            items: {},
          },
        },
        answerReviewAuthorized: false,
      }),
    ).toMatchObject({ status: "completed" });

    expect(() =>
      QuizAttemptStateSchema.parse({
        attemptId: "attempt-1",
        groupId: QUIZ_GROUP_ID,
        status: "paused",
        currentTargetId: null,
        submittedTargetIds: [],
        startedAt: null,
        finishedAt: null,
        expiresAt: null,
        score: null,
        resultsByTargetId: {},
        answerReviewAuthorized: false,
      }),
    ).toThrow();
  });
});
