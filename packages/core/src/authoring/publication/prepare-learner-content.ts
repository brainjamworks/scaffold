import type { JSONContent } from "@tiptap/core";
import {
  ScaffoldDocumentContentSchema,
  type AssessmentGroupContract,
  type AssessmentTargetContract,
  type ScaffoldDocumentContent,
} from "@scaffold/contracts";
import { Result, type Result as ResultType } from "better-result";
import type { Schema } from "@tiptap/pm/model";

import type { DocumentCapabilityLookups } from "@/document/model/establishment";
import { checkLearnerProjectionReadiness } from "@/document/model/establishment";
import type { ScaffoldProductAccess } from "@/host/contracts/product-access";

import {
  ArtifactSavePayloadError,
  validateLearnerPublicationPayloadSize,
  type LearnerPublicationPayloadPart,
} from "./artifact-save-bundle";
import { projectLearnerPublication, type AssessmentProjectionWarning } from "./document-projection";

export interface LearnerPreparationContext {
  readonly capabilities: DocumentCapabilityLookups;
  readonly authoringSchema: Schema;
  readonly expectedRequiresScaffoldPlus: boolean;
  readonly productAccess: ScaffoldProductAccess;
}

export interface PreparedLearnerContent {
  readonly canonicalDocument: ScaffoldDocumentContent;
  readonly learnerContent: JSONContent;
  readonly assessmentTargets: AssessmentTargetContract[];
  readonly assessmentGroups: AssessmentGroupContract[];
}

export type LearnerContentPreparationError =
  | {
      readonly reason: "invalid";
      readonly issues: readonly {
        readonly code: string;
        readonly message: string;
        readonly path: readonly (string | number)[];
      }[];
    }
  | { readonly reason: "requires-scaffold-plus" }
  | {
      readonly reason: "unsupported-core-format";
      readonly documentVersion: number;
      readonly supportedVersion: number;
      readonly message: string;
    }
  | {
      readonly reason: "unavailable-content";
      readonly unavailableContent: readonly {
        readonly kind: "block" | "layout" | "surface";
        readonly capabilityId: string;
        readonly stableId: string;
        readonly path: readonly (string | number)[];
      }[];
    }
  | {
      readonly reason: "projection-warning";
      readonly warnings: readonly AssessmentProjectionWarning[];
    }
  | {
      readonly reason: "payload-too-large";
      readonly part: LearnerPublicationPayloadPart;
      readonly measuredBytes: number;
      readonly limitBytes: number;
    };

export type LearnerContentPreparationResult = ResultType<
  PreparedLearnerContent,
  LearnerContentPreparationError
>;

export function prepareLearnerContent(
  document: ScaffoldDocumentContent,
  context: LearnerPreparationContext,
): LearnerContentPreparationResult {
  const readiness = checkLearnerProjectionReadiness({
    workingDocument: document,
    capabilities: context.capabilities,
    authoringSchema: context.authoringSchema,
    expectedRequiresScaffoldPlus: context.expectedRequiresScaffoldPlus,
    productAccess: context.productAccess,
  });
  const projection = projectLearnerPublication(
    readiness,
    context.capabilities.blocks,
    context.capabilities.surfaces,
  );

  switch (projection.status) {
    case "invalid":
      return Result.err(
        Object.freeze({
          reason: "invalid" as const,
          issues: Object.freeze(
            projection.issues.map(({ code, message, path }) =>
              Object.freeze({ code, message, path: Object.freeze([...path]) }),
            ),
          ),
        }),
      );
    case "requires-scaffold-plus":
      return Result.err(Object.freeze({ reason: "requires-scaffold-plus" as const }));
    case "unsupported-core-format":
      return Result.err(
        Object.freeze({
          reason: "unsupported-core-format" as const,
          documentVersion: projection.documentVersion,
          supportedVersion: projection.supportedVersion,
          message: projection.message,
        }),
      );
    case "unavailable-content":
      return Result.err(
        Object.freeze({
          reason: "unavailable-content" as const,
          unavailableContent: Object.freeze(
            projection.unavailableContent.map(({ kind, capabilityId, stableId, path }) =>
              Object.freeze({
                kind,
                capabilityId,
                stableId,
                path: Object.freeze([...path]),
              }),
            ),
          ),
        }),
      );
    case "supported":
      break;
  }

  if (projection.warnings.length > 0) {
    return Result.err(
      Object.freeze({
        reason: "projection-warning" as const,
        warnings: Object.freeze(
          projection.warnings.map((warning) => Object.freeze({ ...warning })),
        ),
      }),
    );
  }

  try {
    validateLearnerPublicationPayloadSize(projection);
  } catch (error) {
    if (!(error instanceof ArtifactSavePayloadError)) throw error;
    return Result.err(
      Object.freeze({
        reason: "payload-too-large" as const,
        part: error.part,
        measuredBytes: error.measuredBytes,
        limitBytes: error.limitBytes,
      }),
    );
  }

  if (readiness.status !== "supported") {
    throw new Error("Supported learner projection lost its checked canonical document.");
  }

  return Result.ok(
    Object.freeze({
      canonicalDocument: ScaffoldDocumentContentSchema.parse(readiness.canonicalDocument),
      learnerContent: projection.learnerContent,
      assessmentTargets: projection.assessmentTargets,
      assessmentGroups: projection.assessmentGroups,
    }),
  );
}
