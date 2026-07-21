import { describe, expect, it } from "vite-plus/test";

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
      score: 1,
      maxScore: 1,
      feedback: null,
      items: {},
    },
  },
};
describe("host app contracts", () => {
  it("keeps authoring bootstrap separate from learner bootstrap", () => {
    const artifact = {
      id: "artifact-1",
      title: "Artifact title",
      mode: "page",
      content: { type: "doc", content: [] },
    } satisfies ScaffoldAuthoringArtifact;

    const assessmentSnapshot = {
      snapshotVersion: 1,
      artifactId: artifact.id,
      problems: {
        "target-1": {
          response: { kind: "single-select", optionId: "choice-a" },
          submitted: true,
          attemptNumber: 1,
          hintsShown: 0,
          checkResult: null,
          submissionResult: {
            isCorrect: true,
            score: 1,
            maxScore: 1,
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
    } satisfies ScaffoldLearnerHostServices;

    expect(authoringServices.artifactPersistence).toBe(artifactPersistence);
    await expect(
      learnerServices.assessment?.submit({
        problemId: "problem-1",
        targetId: "target-1",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "option-1" },
        expectedAttemptNumber: 0,
      }),
    ).resolves.toMatchObject({ problem: { submissionResult: { isCorrect: true } } });
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
      groupId: "quiz-1",
      status: "in_progress",
      currentTargetId: "target-1",
      submittedTargetIds: [],
      startedAt: "2026-06-18T08:00:00.000Z",
      finishedAt: null,
      expiresAt: null,
      score: null,
      maxScore: null,
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
        groupId: "quiz-2",
      }),
    ).resolves.toMatchObject({ quizAttempt: { groupId: "quiz-2" } });
    await expect(
      port.quiz.submitQuestion({
        attemptId: "attempt-1",
        groupId: "quiz-1",
        targetId: "target-1",
        response: { kind: "single-select", optionId: "a" },
        expectedAttemptNumber: 0,
      }),
    ).resolves.toMatchObject({ quizAttempt: { submittedTargetIds: ["target-1"] } });
    await expect(
      port.quiz.finishAttempt({
        attemptId: "attempt-1",
        groupId: "quiz-1",
        responsesByTargetId: {
          "target-1": { kind: "single-select", optionId: "a" },
        },
      }),
    ).resolves.toMatchObject({ quizAttempt: { status: "completed" } });
    await expect(
      port.quiz.revealAnswers?.({
        attemptId: "attempt-1",
        groupId: "quiz-1",
      }),
    ).resolves.toMatchObject({ quizAttempt: { answerReviewAuthorized: true } });
  });

  it("validates quiz attempt state at port boundaries", () => {
    expect(
      QuizAttemptStateSchema.parse({
        attemptId: "attempt-1",
        groupId: "quiz-1",
        status: "completed",
        currentTargetId: null,
        submittedTargetIds: ["target-1"],
        startedAt: "2026-06-18T08:00:00.000Z",
        finishedAt: "2026-06-18T08:05:00.000Z",
        expiresAt: null,
        score: 1,
        maxScore: 1,
        resultsByTargetId: {
          "target-1": {
            isCorrect: true,
            score: 1,
            maxScore: 1,
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
        groupId: "quiz-1",
        status: "paused",
        currentTargetId: null,
        submittedTargetIds: [],
        startedAt: null,
        finishedAt: null,
        expiresAt: null,
        score: null,
        maxScore: null,
        resultsByTargetId: {},
        answerReviewAuthorized: false,
      }),
    ).toThrow();
  });
});
