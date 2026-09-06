import type { JSONContent } from "@tiptap/core";
import {
  LearnerInteractionConfigurationV1Schema,
  PresentationConfigurationV1Schema,
  type AssessmentGroupContract,
  type AssessmentTargetContract,
} from "@scaffold/contracts";
import { Result, type Result as ResultType } from "better-result";

import type { CompilationSnapshot } from "@/authoring/publication/build-compilation-snapshot";
import type {
  LearnerContentPreparationError,
  LearnerContentPreparationResult,
} from "@/authoring/publication/prepare-learner-content";
import type { ScaffoldLearnerHostServices } from "@/host/contracts";
import { compileLearnerInteractions } from "@/learner-interaction/model";
import {
  compilePresentation,
  type CompiledPresentationPlaybackProgram,
} from "@/presentation/model";
import type { SlideshowSurfaceRuntimeProgramSource } from "@/runtime/players/slideshow/slideshow-surface-runtime-composition";

import type {
  AuthorPreviewFailure,
  AuthorPreviewPreparationInput,
} from "./author-preview-session-controller";

export interface AuthorPreviewContent {
  readonly assessmentGroups: AssessmentGroupContract[];
  readonly assessmentTargets: AssessmentTargetContract[];
  readonly learnerContent: JSONContent;
}

export type AuthorPreviewHostServices = Omit<ScaffoldLearnerHostServices, "learningEvents">;

export interface PreparedAuthorPreview {
  readonly content: AuthorPreviewContent;
  readonly services: AuthorPreviewHostServices;
  readonly program: SlideshowSurfaceRuntimeProgramSource | null;
}

export interface AuthorPreviewRuntimeModule {
  readonly createSlideshowRuntimeProgramSource: (input: {
    readonly presentation?: CompiledPresentationPlaybackProgram;
    readonly learnerInteractions?: ReturnType<typeof compileLearnerInteractions>["surfaceById"];
  }) => SlideshowSurfaceRuntimeProgramSource;
}

export interface PrepareAuthorPreviewDependencies {
  readonly prepareLearnerContent: (
    document: AuthorPreviewPreparationInput["document"],
  ) => LearnerContentPreparationResult;
  readonly buildCompilationSnapshot: (
    document: AuthorPreviewPreparationInput["document"],
    revision: number,
  ) => CompilationSnapshot;
  readonly createServices?: (
    content: AuthorPreviewContent,
  ) => AuthorPreviewHostServices | Promise<AuthorPreviewHostServices>;
  readonly fallbackServices: ScaffoldLearnerHostServices;
  readonly loadRuntimeModule: () => Promise<AuthorPreviewRuntimeModule>;
}

export async function prepareAuthorPreview(
  input: AuthorPreviewPreparationInput,
  dependencies: PrepareAuthorPreviewDependencies,
  retainedServices: AuthorPreviewHostServices | null,
): Promise<ResultType<PreparedAuthorPreview, AuthorPreviewFailure>> {
  const preparation = dependencies.prepareLearnerContent(input.document);
  if (preparation.isErr()) return Result.err(toPreviewPreparationError(preparation.error));
  const compilation = dependencies.buildCompilationSnapshot(
    preparation.value.canonicalDocument,
    input.revision,
  );
  if (compilation.revision !== input.revision) {
    throw new Error("Author Preview compilation did not match its captured document revision.");
  }
  const structure = compilation.courseStructure;
  if (!structure || !structure.surfaceIds.includes(input.surfaceId)) {
    return Result.err(
      Object.freeze({
        reason: "preview-surface-not-current" as const,
        surfaceId: input.surfaceId,
        currentSurfaceIds: Object.freeze([...(structure?.surfaceIds ?? [])]),
      }),
    );
  }

  const documentTree = (preparation.value.canonicalDocument as JSONContent).content?.[0];
  if (documentTree?.type !== "courseDocument" || !documentTree.attrs) {
    throw new Error("Author Preview received a malformed Course Document root.");
  }
  const presentationValue = documentTree.attrs["presentation"];
  const interactionValue = documentTree.attrs["learnerInteractions"];
  const needsCompiledProgram =
    (presentationValue !== null && presentationValue !== undefined) ||
    (interactionValue !== null && interactionValue !== undefined);
  if (needsCompiledProgram && structure.kind !== "slideshow") {
    return Result.err(Object.freeze({ reason: "preview-not-slideshow", mode: "page" }));
  }
  let presentation: Parameters<
    AuthorPreviewRuntimeModule["createSlideshowRuntimeProgramSource"]
  >[0]["presentation"];
  if (presentationValue !== null && presentationValue !== undefined) {
    const compiled = compilePresentation({
      configuration: PresentationConfigurationV1Schema.parse(presentationValue),
      courseStructure: structure as Extract<typeof structure, { readonly kind: "slideshow" }>,
      semanticSnapshot: compilation.documentTree,
    });
    if (compiled.isErr()) return Result.err(compiled.error);
    if (!compiled.value.program) {
      throw new Error("Configured Author Preview Presentation compiled without a program.");
    }
    presentation = compiled.value.program;
  }

  let learnerInteractions: Parameters<
    AuthorPreviewRuntimeModule["createSlideshowRuntimeProgramSource"]
  >[0]["learnerInteractions"];
  if (interactionValue !== null && interactionValue !== undefined) {
    learnerInteractions = compileLearnerInteractions({
      configuration: LearnerInteractionConfigurationV1Schema.parse(interactionValue),
      courseStructure: structure as Extract<typeof structure, { readonly kind: "slideshow" }>,
      semanticSnapshot: compilation.documentTree,
      controlCapabilities: compilation.controlCapabilities,
    }).surfaceById;
  }

  let runtimeModule: AuthorPreviewRuntimeModule;
  try {
    runtimeModule = await dependencies.loadRuntimeModule();
  } catch (cause) {
    return Result.err(Object.freeze({ reason: "preview-runtime-unavailable" as const, cause }));
  }
  const content: AuthorPreviewContent = {
    assessmentGroups: preparation.value.assessmentGroups,
    assessmentTargets: preparation.value.assessmentTargets,
    learnerContent: preparation.value.learnerContent,
  };
  let services = retainedServices;
  if (!services) {
    try {
      services = withoutLearningEventCapability(
        dependencies.createServices
          ? await dependencies.createServices(content)
          : dependencies.fallbackServices,
      );
    } catch (cause) {
      return Result.err(Object.freeze({ reason: "preview-services-unavailable" as const, cause }));
    }
  }

  return Result.ok(
    Object.freeze({
      content,
      services,
      program:
        structure.kind === "slideshow"
          ? runtimeModule.createSlideshowRuntimeProgramSource({
              ...(presentation ? { presentation } : {}),
              ...(learnerInteractions ? { learnerInteractions } : {}),
            })
          : null,
    }),
  );
}

function toPreviewPreparationError(failure: LearnerContentPreparationError): AuthorPreviewFailure {
  switch (failure.reason) {
    case "invalid":
      return Object.freeze({
        reason: "preview-document-invalid" as const,
        issues: Object.freeze(
          failure.issues.map(({ code, path, message }) =>
            Object.freeze({ code, path: Object.freeze([...path]), message }),
          ),
        ),
      });
    case "requires-scaffold-plus":
      return Object.freeze({ reason: "preview-requires-scaffold-plus" as const });
    case "unsupported-core-format":
      return Object.freeze({
        reason: "preview-unsupported-core-format" as const,
        documentVersion: failure.documentVersion,
        supportedVersion: failure.supportedVersion,
        message: failure.message,
      });
    case "unavailable-content":
      return Object.freeze({
        reason: "preview-unavailable-content" as const,
        unavailableContent: Object.freeze(
          failure.unavailableContent.map(({ kind, capabilityId, stableId, path }) =>
            Object.freeze({
              kind,
              capabilityId,
              stableId,
              path: Object.freeze([...path]),
            }),
          ),
        ),
      });
    case "projection-warning":
      return Object.freeze({
        reason: "preview-projection-warning" as const,
        warnings: failure.warnings,
      });
    case "payload-too-large":
      return Object.freeze({
        reason: "preview-payload-too-large" as const,
        part: failure.part,
        measuredBytes: failure.measuredBytes,
        limitBytes: failure.limitBytes,
      });
  }
}

function withoutLearningEventCapability(
  services: ScaffoldLearnerHostServices,
): AuthorPreviewHostServices {
  const previewServices = { ...services };
  delete previewServices.learningEvents;
  return previewServices;
}
