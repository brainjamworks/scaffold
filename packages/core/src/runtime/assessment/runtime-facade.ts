import { useEffect, useMemo, useRef } from "react";

import type {
  AnswerReveal,
  AssessmentInteractionKind,
  AssessmentProblemSnapshot,
  AssessmentResult,
  QuizAttemptState,
} from "@scaffold/contracts";
import type { AssessmentCapabilityResponseDefinition } from "../../editor/blocks/block-definition";
import { useAssessmentPort } from "@/host/providers/ScaffoldServicesProvider";
import { scopeAssessmentGroupId, scopeAssessmentProblemId } from "./assessment-store";
import { useAssessmentStoreSelector } from "./AssessmentRuntimeProvider";
import type {
  AssessmentGroupId,
  AssessmentProblemId,
  AssessmentQuizRegistration,
  AssessmentQuizRegistrationInput,
  AssessmentRegistration,
  AssessmentRegistrationConfig,
  AssessmentRegistrationInput,
  AssessmentRequestState,
} from "./types";

export type AssessmentFacadeStatus = "unsafe-identity" | "missing-registration" | "registered";

export interface AssessmentProblemFacadeActions {
  readonly setLocalResponse: (response: unknown) => boolean;
  readonly check: () => Promise<AssessmentResult | null>;
  readonly submit: () => Promise<AssessmentResult | null>;
  readonly reset: () => boolean;
  readonly revealHint: () => Promise<boolean>;
  readonly revealAnswer: () => Promise<AnswerReveal | null>;
}

export interface AssessmentProblemFacade {
  readonly status: AssessmentFacadeStatus;
  readonly authoredProblemId: string;
  readonly problemId: AssessmentProblemId | null;
  readonly targetId: string | null;
  readonly interactionKind: AssessmentInteractionKind | null;
  readonly capability: AssessmentCapabilityResponseDefinition | null;
  readonly config: AssessmentRegistrationConfig | null;
  readonly problem: AssessmentProblemSnapshot | null;
  readonly localResponse: unknown;
  readonly responseReady: boolean;
  readonly request: AssessmentRequestState | null;
  readonly revealedAnswer: AnswerReveal | null;
  readonly quiz: AssessmentProblemQuizContext | null;
  readonly actions: AssessmentProblemFacadeActions;
}

export interface AssessmentProblemQuizContext {
  readonly registration: AssessmentQuizRegistration;
  readonly attempt: QuizAttemptState | null;
}

export interface AssessmentQuizProblemFacade {
  readonly authoredProblemId: string;
  readonly problemId: AssessmentProblemId;
  readonly targetId: string;
  readonly interactionKind: AssessmentInteractionKind;
  readonly capability: AssessmentCapabilityResponseDefinition;
  readonly problem: AssessmentProblemSnapshot | null;
  readonly responseReady: boolean;
}

export interface AssessmentQuizFacadeActions {
  readonly start: () => Promise<QuizAttemptState | null>;
  readonly submitQuestion: (targetId: string) => Promise<QuizAttemptState | null>;
  readonly finish: () => Promise<QuizAttemptState | null>;
  readonly expire: () => Promise<QuizAttemptState | null>;
  readonly revealAnswers: () => Promise<QuizAttemptState | null>;
}

export interface AssessmentQuizFacade {
  readonly status: AssessmentFacadeStatus;
  readonly authoredGroupId: string;
  readonly groupId: AssessmentGroupId | null;
  readonly registration: AssessmentQuizRegistration | null;
  readonly attempt: QuizAttemptState | null;
  readonly problemsByTargetId: Readonly<Record<string, AssessmentQuizProblemFacade>>;
  readonly request: AssessmentRequestState | null;
  readonly available: boolean;
  readonly actions: AssessmentQuizFacadeActions;
}

export function useAssessmentProblemFacade(
  registration: AssessmentRegistrationInput,
): AssessmentProblemFacade {
  const initialRegistration = useRef(registration);
  initialRegistration.current = registration;
  const facade = useAssessmentProblemFacadeById(registration.problemId);
  const register = useAssessmentStoreSelector((state) => state.register);
  const update = useAssessmentStoreSelector((state) => state.update);
  const unregister = useAssessmentStoreSelector((state) => state.unregister);
  const identity = registrationIdentity(registration);
  const identityKey = facade.problemId;

  useEffect(() => {
    if (!identityKey) return undefined;
    const mountedRegistration = initialRegistration.current;
    register(mountedRegistration);
    return () => {
      unregister(registrationIdentity(mountedRegistration));
    };
  }, [
    identity.interactionKind,
    identity.problemId,
    identity.targetId,
    identityKey,
    register,
    unregister,
  ]);

  useEffect(() => {
    if (!identityKey) return;
    update(registration);
  }, [identityKey, registration, update]);

  return facade;
}

export function useAssessmentProblemFacadeById(
  authoredProblemId: string | null | undefined,
  expectedInteractionKind?: AssessmentInteractionKind,
): AssessmentProblemFacade {
  const artifactId = useAssessmentStoreSelector((state) => state.artifactId);
  const problemId = safeProblemId(artifactId, authoredProblemId);
  const registration = useAssessmentStoreSelector((state) =>
    problemId ? state.registrations[problemId] : undefined,
  );
  const problem = useAssessmentStoreSelector((state) =>
    problemId ? state.durable.problems[problemId] : undefined,
  );
  const responseReady = useAssessmentStoreSelector((state) =>
    problemId ? (state.transient.responseReady[problemId] ?? false) : false,
  );
  const request = useAssessmentStoreSelector((state) =>
    problemId ? state.requests[problemId] : undefined,
  );
  const revealedAnswer = useAssessmentStoreSelector((state) =>
    problemId ? state.transient.revealedAnswers[problemId] : undefined,
  );
  const quizRegistrations = useAssessmentStoreSelector((state) => state.quizRegistrations);
  const quizAttempts = useAssessmentStoreSelector((state) => state.durable.quizzes);
  const setLocalResponse = useAssessmentStoreSelector((state) => state.setLocalResponse);
  const check = useAssessmentStoreSelector((state) => state.check);
  const submit = useAssessmentStoreSelector((state) => state.submit);
  const reset = useAssessmentStoreSelector((state) => state.reset);
  const revealHint = useAssessmentStoreSelector((state) => state.revealHint);
  const revealAnswer = useAssessmentStoreSelector((state) => state.revealAnswer);

  if (
    registration &&
    expectedInteractionKind &&
    registration.interactionKind !== expectedInteractionKind
  ) {
    throw new Error(
      `Assessment facade expected "${expectedInteractionKind}" interaction for "${authoredProblemId ?? ""}", but registered "${registration.interactionKind}".`,
    );
  }

  const localResponse = decodeLocalResponse(registration, problem);
  const quiz = useMemo<AssessmentProblemQuizContext | null>(() => {
    if (!registration) return null;
    const quizRegistration = Object.values(quizRegistrations).find((candidate) =>
      candidate.targetIds.includes(registration.targetId),
    );
    if (!quizRegistration) return null;
    return {
      registration: quizRegistration,
      attempt: quizAttempts[quizRegistration.groupId] ?? null,
    };
  }, [quizAttempts, quizRegistrations, registration]);
  const actions = useMemo<AssessmentProblemFacadeActions>(() => {
    const identity = registration
      ? registrationIdentityForAuthoredProblem(authoredProblemId ?? "", registration)
      : null;
    return {
      setLocalResponse: (response) => (identity ? setLocalResponse(identity, response) : false),
      check: () => (identity ? check(identity) : Promise.resolve(null)),
      submit: () => (identity ? submit(identity) : Promise.resolve(null)),
      reset: () => (identity ? reset(identity) : false),
      revealHint: () => (identity ? revealHint(identity) : Promise.resolve(false)),
      revealAnswer: () => (identity ? revealAnswer(identity) : Promise.resolve(null)),
    };
  }, [
    authoredProblemId,
    check,
    registration,
    reset,
    revealAnswer,
    revealHint,
    setLocalResponse,
    submit,
  ]);

  return {
    status: !problemId ? "unsafe-identity" : registration ? "registered" : "missing-registration",
    authoredProblemId: authoredProblemId ?? "",
    problemId,
    targetId: registration?.targetId ?? null,
    interactionKind: registration?.interactionKind ?? null,
    capability: registration?.response ?? null,
    config: registration?.config ?? null,
    problem: problem ?? null,
    localResponse,
    responseReady,
    request: request ?? null,
    revealedAnswer: revealedAnswer ?? null,
    quiz,
    actions,
  };
}

export function useAssessmentQuizFacade(
  registration: AssessmentQuizRegistrationInput,
  enabled = true,
): AssessmentQuizFacade {
  const initialRegistration = useRef(registration);
  initialRegistration.current = registration;
  const assessmentPort = useAssessmentPort();
  const artifactId = useAssessmentStoreSelector((state) => state.artifactId);
  const groupId = enabled ? safeGroupId(artifactId, registration.groupId) : null;
  const storedRegistration = useAssessmentStoreSelector((state) =>
    groupId ? state.quizRegistrations[groupId] : undefined,
  );
  const attempt = useAssessmentStoreSelector((state) =>
    groupId ? state.durable.quizzes[groupId] : undefined,
  );
  const request = useAssessmentStoreSelector((state) =>
    groupId ? state.requests[groupId] : undefined,
  );
  const problemRegistrations = useAssessmentStoreSelector((state) => state.registrations);
  const problems = useAssessmentStoreSelector((state) => state.durable.problems);
  const responseReady = useAssessmentStoreSelector((state) => state.transient.responseReady);
  const registerQuiz = useAssessmentStoreSelector((state) => state.registerQuiz);
  const updateQuiz = useAssessmentStoreSelector((state) => state.updateQuiz);
  const unregisterQuiz = useAssessmentStoreSelector((state) => state.unregisterQuiz);
  const startQuizAttempt = useAssessmentStoreSelector((state) => state.startQuizAttempt);
  const submitQuizQuestion = useAssessmentStoreSelector((state) => state.submitQuizQuestion);
  const finishQuizAttempt = useAssessmentStoreSelector((state) => state.finishQuizAttempt);
  const expireQuizAttempt = useAssessmentStoreSelector((state) => state.expireQuizAttempt);
  const revealQuizAnswers = useAssessmentStoreSelector((state) => state.revealQuizAnswers);

  useEffect(() => {
    if (!groupId) return undefined;
    const mountedRegistration = initialRegistration.current;
    registerQuiz(mountedRegistration);
    return () => {
      unregisterQuiz({ groupId: mountedRegistration.groupId });
    };
  }, [groupId, registerQuiz, registration.groupId, unregisterQuiz]);

  useEffect(() => {
    if (!groupId) return;
    updateQuiz(registration);
  }, [groupId, registration, updateQuiz]);

  const problemsByTargetId = useMemo(() => {
    if (!storedRegistration) return {};
    const selected: Record<string, AssessmentQuizProblemFacade> = {};
    for (const targetId of storedRegistration.targetIds) {
      const problemRegistration = Object.values(problemRegistrations).find(
        (candidate) => candidate.targetId === targetId,
      );
      if (!problemRegistration) continue;
      selected[targetId] = {
        authoredProblemId: authoredProblemIdFromScoped(artifactId, problemRegistration.problemId),
        problemId: problemRegistration.problemId,
        targetId,
        interactionKind: problemRegistration.interactionKind,
        capability: problemRegistration.response,
        problem: problems[problemRegistration.problemId] ?? null,
        responseReady: responseReady[problemRegistration.problemId] ?? false,
      };
    }
    return selected;
  }, [artifactId, problemRegistrations, problems, responseReady, storedRegistration]);

  const actions = useMemo<AssessmentQuizFacadeActions>(() => {
    const quizIdentity = groupId ? { groupId: registration.groupId } : null;
    return {
      start: () => (quizIdentity ? startQuizAttempt(quizIdentity) : Promise.resolve(null)),
      submitQuestion: (targetId) => {
        if (!quizIdentity) return Promise.resolve(null);
        const problem = problemsByTargetId[targetId];
        if (!problem) return Promise.resolve(null);
        return submitQuizQuestion(quizIdentity, {
          problemId: problem.authoredProblemId,
          targetId: problem.targetId,
          interactionKind: problem.interactionKind,
        });
      },
      finish: () => (quizIdentity ? finishQuizAttempt(quizIdentity) : Promise.resolve(null)),
      expire: () => (quizIdentity ? expireQuizAttempt(quizIdentity) : Promise.resolve(null)),
      revealAnswers: () => (quizIdentity ? revealQuizAnswers(quizIdentity) : Promise.resolve(null)),
    };
  }, [
    expireQuizAttempt,
    finishQuizAttempt,
    groupId,
    problemsByTargetId,
    registration.groupId,
    revealQuizAnswers,
    startQuizAttempt,
    submitQuizQuestion,
  ]);

  return {
    status: !groupId
      ? "unsafe-identity"
      : storedRegistration
        ? "registered"
        : "missing-registration",
    authoredGroupId: registration.groupId,
    groupId,
    registration: storedRegistration ?? null,
    attempt: attempt ?? null,
    problemsByTargetId,
    request: request ?? null,
    available: Boolean(assessmentPort?.quiz),
    actions,
  };
}

function registrationIdentity(registration: AssessmentRegistrationInput) {
  return {
    problemId: registration.problemId,
    targetId: registration.targetId,
    interactionKind: registration.interactionKind,
  };
}

function registrationIdentityForAuthoredProblem(
  authoredProblemId: string,
  registration: AssessmentRegistration,
) {
  return {
    problemId: authoredProblemId,
    targetId: registration.targetId,
    interactionKind: registration.interactionKind,
  };
}

function safeProblemId(
  artifactId: string,
  authoredProblemId: string | null | undefined,
): AssessmentProblemId | null {
  try {
    return scopeAssessmentProblemId(artifactId, authoredProblemId ?? "");
  } catch {
    return null;
  }
}

function safeGroupId(artifactId: string, authoredGroupId: string): AssessmentGroupId | null {
  try {
    return scopeAssessmentGroupId(artifactId, authoredGroupId);
  } catch {
    return null;
  }
}

function decodeLocalResponse(
  registration: AssessmentRegistration | undefined,
  problem: AssessmentProblemSnapshot | undefined,
): unknown {
  if (!registration || !problem?.response) return null;
  if (problem.response.kind !== registration.interactionKind) {
    throw new Error(
      `Assessment facade cannot decode response kind "${problem.response.kind}" with registered interaction "${registration.interactionKind}".`,
    );
  }
  const decoded = registration.response.fromContractResponse(problem.response);
  const parsed = registration.response.schema.safeParse(decoded);
  if (!parsed.success) {
    throw new Error("Assessment facade decoded response failed the registered local schema.");
  }
  return parsed.data;
}

function authoredProblemIdFromScoped(artifactId: string, problemId: AssessmentProblemId): string {
  const prefix = `artifact:${encodeURIComponent(artifactId)}/block:`;
  if (!problemId.startsWith(prefix)) {
    throw new Error("Assessment problem registration is outside the current artifact scope.");
  }
  return decodeURIComponent(problemId.slice(prefix.length));
}
