import type { ProjectedCourseStructure } from "@/document/model/course-structure";
import type { DocumentTreeSnapshot } from "@/document/model/document-tree";

import { createSemanticActivationRegistry } from "./semantic-activation-registry";
import {
  createSemanticTargetInteractionCoordinator,
  type SemanticSurfacePresentationPort,
  type SemanticTargetInteractionCoordinator,
} from "./semantic-target-interaction-coordinator";
import type { SemanticActivationRegistry } from "./semantic-target-interaction";

export type SemanticActivationRegistryPort = Pick<
  SemanticActivationRegistry,
  "register" | "resolve"
>;

export interface SemanticTargetInteractionEnvironment {
  readonly registry: SemanticActivationRegistryPort;
  readonly coordinator: SemanticTargetInteractionCoordinator;
}

export interface SemanticTargetInteractionEnvironmentOwner {
  readonly environment: SemanticTargetInteractionEnvironment;
  dispose(): void;
}

export interface CreateSemanticTargetInteractionEnvironmentInput {
  readonly getSemantics: () => DocumentTreeSnapshot;
  readonly getCourseStructure: () => ProjectedCourseStructure;
  readonly surfacePresentation: SemanticSurfacePresentationPort;
}

export function createSemanticTargetInteractionEnvironment({
  getSemantics,
  getCourseStructure,
  surfacePresentation,
}: CreateSemanticTargetInteractionEnvironmentInput): SemanticTargetInteractionEnvironmentOwner {
  const registry = createSemanticActivationRegistry();
  const lifecycle = new AbortController();
  const registryPort: SemanticActivationRegistryPort = {
    register: (binding) => registry.register(binding),
    resolve: (ownerId) => registry.resolve(ownerId),
  };
  const coordinator = createSemanticTargetInteractionCoordinator({
    registry: registryPort,
    getSemantics,
    getCourseStructure,
    surfacePresentation,
    lifecycleSignal: lifecycle.signal,
  });
  const environment = Object.freeze({ registry: registryPort, coordinator });
  let disposed = false;

  return Object.freeze({
    environment,
    dispose() {
      if (disposed) return;
      disposed = true;
      lifecycle.abort();
      registry.dispose();
    },
  });
}
