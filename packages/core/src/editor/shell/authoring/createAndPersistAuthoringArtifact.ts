import { createArtifactSavePayload } from "@/authoring/publication/artifact-save-bundle";
import type { CourseDocumentAuthoringEnvironment } from "@/composition/authoring/create-authoring-composition";
import { prepareScaffoldArtifactForAuthoring } from "@/document/authoring/prepare-scaffold-artifact-for-authoring";
import { createScaffoldArtifact } from "@/format/artifact";
import type { ArtifactRevision } from "@/host/ports/learner-publication";
import type {
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringEntryHostServices,
} from "@/host/contracts";
import type { ScaffoldProductAccess } from "@/host/contracts/product-access";

const DEFAULT_CREATED_ARTIFACT_TITLE = "Untitled";
const DEFAULT_INITIAL_COURSE_SECTION_TITLE = "Section 1";

export interface AuthoringArtifactCreationResult {
  readonly artifact: ScaffoldAuthoringArtifact;
  readonly artifactRevision: ArtifactRevision;
}

type CreateAndPersistAuthoringArtifactInput = {
  productAccess: ScaffoldProductAccess;
  services: ScaffoldAuthoringEntryHostServices;
  authoringEnvironment: CourseDocumentAuthoringEnvironment;
} & { mode: "page" | "slideshow" };

export async function createAndPersistAuthoringArtifact(
  input: CreateAndPersistAuthoringArtifactInput,
): Promise<AuthoringArtifactCreationResult> {
  const { mode, productAccess, services, authoringEnvironment } = input;
  const metadata = await services.artifactCreation.createArtifactMetadata({ mode });
  const artifact = createScaffoldArtifact({
    id: metadata.id,
    title: metadata.title ?? DEFAULT_CREATED_ARTIFACT_TITLE,
    ...(mode === "slideshow"
      ? { mode, initialCourseSectionTitle: DEFAULT_INITIAL_COURSE_SECTION_TITLE }
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
  const hostTitle = result?.artifact?.title;
  return {
    artifact:
      typeof hostTitle === "string" && hostTitle
        ? { ...establishedArtifact, title: hostTitle }
        : establishedArtifact,
    artifactRevision: result.artifactRevision,
  };
}
