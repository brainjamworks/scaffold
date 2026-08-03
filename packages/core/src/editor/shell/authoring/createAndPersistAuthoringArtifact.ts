import {
  projectArtifactSaveBundle,
  validateArtifactSaveBundleSize,
} from "@/authoring/publication/artifact-save-bundle";
import { createScaffoldArtifact } from "@/format/artifact";
import type { ScaffoldArtifactCreationMode } from "@/host/ports/artifact-creation";
import type {
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringEntryHostServices,
} from "@/host/contracts";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

const DEFAULT_CREATED_ARTIFACT_TITLE = "Untitled";

export async function createAndPersistAuthoringArtifact({
  mode,
  services,
  blockDefinitions,
}: {
  mode: ScaffoldArtifactCreationMode;
  services: ScaffoldAuthoringEntryHostServices;
  blockDefinitions: BlockDefinitionLookup;
}): Promise<ScaffoldAuthoringArtifact> {
  const metadata = await services.artifactCreation.createArtifactMetadata({ mode });
  const artifact = createScaffoldArtifact({
    id: metadata.id,
    title: metadata.title ?? DEFAULT_CREATED_ARTIFACT_TITLE,
    mode,
  });
  const bundle = projectArtifactSaveBundle({ artifact }, blockDefinitions);
  validateArtifactSaveBundleSize(bundle);
  const result = await services.artifactPersistence.saveArtifact(bundle);
  const hostTitle = result?.artifact?.title;
  return typeof hostTitle === "string" && hostTitle ? { ...artifact, title: hostTitle } : artifact;
}
