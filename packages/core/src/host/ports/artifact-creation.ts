import type { CourseMode } from "@scaffold/contracts";

export type ScaffoldArtifactCreationMode = Extract<CourseMode, "page" | "slideshow">;

export interface ScaffoldArtifactCreationInput {
  mode: ScaffoldArtifactCreationMode;
}

export interface ScaffoldArtifactCreationMetadata {
  id: string;
  title?: string | undefined;
}

export interface ScaffoldArtifactCreationPort {
  createArtifactMetadata: (
    input: ScaffoldArtifactCreationInput,
  ) => Promise<ScaffoldArtifactCreationMetadata>;
}
