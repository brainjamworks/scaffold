import { createArtifactSavePayload } from "@/authoring/publication/artifact-save-bundle";
import { Result, type Result as ResultType } from "better-result";
import type { CourseDocumentAuthoringEnvironment } from "@/composition/authoring/create-authoring-composition";
import { prepareScaffoldArtifactForAuthoring } from "@/document/authoring/prepare-scaffold-artifact-for-authoring";
import { createDefaultCourseSectionTitle } from "@/document/model/course-structure";
import { createScaffoldArtifact } from "@/format/artifact";
import type { ArtifactRevision } from "@/host/ports/learner-publication";
import type { ArtifactPersistenceFailure } from "@/host/ports";
import type {
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringEntryHostServices,
} from "@/host/contracts";
import type { ScaffoldProductAccess } from "@/host/contracts/product-access";

const DEFAULT_CREATED_ARTIFACT_TITLE = "Untitled";

export interface AuthoringArtifactCreationResult {
  readonly artifact: ScaffoldAuthoringArtifact;
  readonly artifactRevision: ArtifactRevision;
}

export type AuthoringArtifactCreationOutcome = ResultType<
  AuthoringArtifactCreationResult,
  ArtifactPersistenceFailure
>;

type CreateAndPersistAuthoringArtifactInput = {
  productAccess: ScaffoldProductAccess;
  services: ScaffoldAuthoringEntryHostServices;
  authoringEnvironment: CourseDocumentAuthoringEnvironment;
} & { mode: "page" | "slideshow" };

export async function createAndPersistAuthoringArtifact(
  input: CreateAndPersistAuthoringArtifactInput,
): Promise<AuthoringArtifactCreationOutcome> {
  const { mode, productAccess, services, authoringEnvironment } = input;
  const metadata = await services.artifactCreation.createArtifactMetadata({ mode });
  const artifact = createScaffoldArtifact({
    id: metadata.id,
    title: metadata.title ?? DEFAULT_CREATED_ARTIFACT_TITLE,
    ...(mode === "slideshow"
      ? { mode, initialCourseSectionTitle: createDefaultCourseSectionTitle(1) }
      : { mode }),
    requiresScaffoldPlus: metadata.requiresScaffoldPlus,
  });
  const prepared = prepareScaffoldArtifactForAuthoring(
    artifact,
    authoringEnvironment,
    productAccess,
  );
  if (prepared.status !== "supported") {
    throw new Error("A newly created Scaffold artifact did not establish as supported content.");
  }
  const establishedArtifact = prepared.artifact;
  const payload = createArtifactSavePayload({ artifact: establishedArtifact });
  const result = await services.artifactPersistence.saveArtifact(payload);
  if (result.isErr()) return Result.err(result.error);
  const hostTitle = result.value.artifact?.title;
  return Result.ok({
    artifact:
      typeof hostTitle === "string" && hostTitle
        ? { ...establishedArtifact, title: hostTitle }
        : establishedArtifact,
    artifactRevision: result.value.artifactRevision,
  });
}
