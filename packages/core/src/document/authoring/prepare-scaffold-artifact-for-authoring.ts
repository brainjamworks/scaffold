import type { JSONContent } from "@tiptap/core";

import type {
  RequiresScaffoldPlusResult,
  ScaffoldProductAccess,
} from "@/host/contracts/product-access";
import {
  getCourseDocumentAuthoringEnvironmentState,
  type CourseDocumentAuthoringEnvironment,
} from "@/composition/authoring/create-authoring-composition";
import {
  canonicalizeAuthoringDocument,
  type DocumentEstablishmentIssue,
  type UnavailableContentRef,
} from "@/document/model/establishment";
import { inspectBoundedJson } from "@/document/model/establishment/document-bounds";
import {
  getCourseDocumentAuthoringMountState,
  prepareCourseDocumentAuthoringMount,
  type CourseDocumentAuthoringMount,
} from "@/document/authoring/prepared-authoring-mount";
import { readCourseDocumentAttrs } from "@/format/artifact";
import { ScaffoldArtifactSchema, type ScaffoldArtifact } from "@/schemas/course-document";

export type PreparedScaffoldArtifactValue = Omit<ScaffoldArtifact, "content"> & {
  content: JSONContent;
};

type ScaffoldUninitializedAuthoringBootstrap = Omit<ScaffoldArtifact, "content"> & {
  content: null;
};

export type PreparedScaffoldArtifact =
  | {
      status: "supported" | "unavailable";
      artifact: PreparedScaffoldArtifactValue;
      authoringMount: CourseDocumentAuthoringMount;
      unavailableContent: readonly UnavailableContentRef[];
      source: "stored";
    }
  | {
      status: "uninitialized";
      bootstrap: ScaffoldUninitializedAuthoringBootstrap;
    }
  | {
      status: "invalid";
      message: string;
      issues: readonly DocumentEstablishmentIssue[];
    }
  | {
      status: "unsupported-core-format";
      documentVersion: number;
      supportedVersion: number;
      message: string;
    }
  | RequiresScaffoldPlusResult;

export function prepareScaffoldArtifactForAuthoring(
  value: unknown,
  environment: CourseDocumentAuthoringEnvironment,
  productAccess: ScaffoldProductAccess,
): PreparedScaffoldArtifact {
  const inspection = inspectBoundedJson(value);
  if (!inspection.ok) {
    return {
      status: "invalid",
      message: inspection.issue.message,
      issues: [inspection.issue],
    };
  }
  const parsedArtifact = ScaffoldArtifactSchema.safeParse(inspection.ownedValue);
  if (!parsedArtifact.success) {
    return invalidPreparedArtifact("invalid_artifact", parsedArtifact.error.message, []);
  }

  const artifact = parsedArtifact.data;
  if (artifact.content === null) {
    return {
      status: "uninitialized",
      bootstrap: { ...artifact, content: null },
    };
  }

  const preparedMount = prepareCourseDocumentAuthoringMount(
    artifact.content,
    environment,
    productAccess,
  );
  if (preparedMount.status === "requires-scaffold-plus") return preparedMount;
  if (preparedMount.status === "invalid" || preparedMount.status === "unsupported-core-format") {
    return preparedMount.status === "invalid"
      ? {
          status: "invalid",
          message: preparedMount.issues[0]?.message ?? "Scaffold artifact content is invalid.",
          issues: preparedMount.issues,
        }
      : preparedMount;
  }

  const environmentState = getCourseDocumentAuthoringEnvironmentState(environment);
  const mountState = getCourseDocumentAuthoringMountState(preparedMount.mount);
  const canonicalization = canonicalizeAuthoringDocument({
    workingDocument: mountState.workingDocument,
    capabilities: environmentState.capabilities,
    authoringSchema: environmentState.schema,
    expectedRequiresScaffoldPlus: mountState.expectedRequiresScaffoldPlus,
    productAccess: mountState.productAccess,
  });
  if (canonicalization.status === "requires-scaffold-plus") return canonicalization;
  if (
    canonicalization.status === "invalid" ||
    canonicalization.status === "unsupported-core-format"
  ) {
    if (canonicalization.status === "unsupported-core-format") return canonicalization;
    return {
      status: "invalid",
      message: canonicalization.issues[0]?.message ?? "Scaffold artifact content is invalid.",
      issues: canonicalization.issues,
    };
  }

  const attrs = readCourseDocumentAttrs(canonicalization.canonicalDocument);
  if (!attrs) {
    return invalidPreparedArtifact(
      "invalid_course_document_attrs",
      "Scaffold artifact content is missing courseDocument attrs.",
      ["content", 0, "attrs"],
    );
  }

  if (attrs.mode !== artifact.mode) {
    return invalidPreparedArtifact(
      "artifact_mode_mismatch",
      `Scaffold artifact mode "${artifact.mode}" does not match content mode "${attrs.mode}".`,
      ["content", 0, "attrs", "mode"],
    );
  }

  return {
    status: preparedMount.status,
    artifact: {
      ...artifact,
      content: canonicalization.canonicalDocument,
    },
    authoringMount: preparedMount.mount,
    unavailableContent: preparedMount.unavailableContent,
    source: "stored",
  };
}

function invalidPreparedArtifact(
  code: string,
  message: string,
  path: readonly (string | number)[],
): Extract<PreparedScaffoldArtifact, { status: "invalid" }> {
  return { status: "invalid", message, issues: [{ code, message, path }] };
}
