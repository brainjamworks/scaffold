import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import type { AssessmentPort } from "@/host/ports/assessment";
import { useAssessmentPort } from "@/host/providers/ScaffoldServicesProvider";
import { useScaffoldArtifactIdentity } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { createAssessmentStore } from "./assessment-store";
import { hydrateAssessmentSnapshot } from "./hydration";
import type { AssessmentStore, AssessmentStoreApi } from "./types";

const missingProvider = Symbol("missing AssessmentRuntimeProvider");

const AssessmentStoreContext = createContext<AssessmentStoreApi | null | typeof missingProvider>(
  missingProvider,
);

interface AssessmentRuntimeScope {
  readonly artifactId: string;
  readonly assessmentPort: AssessmentPort | null;
  readonly store: AssessmentStoreApi;
}

function createAssessmentRuntimeScope(
  artifactId: string | null,
  assessmentPort: AssessmentPort | null,
  initialSnapshot: unknown,
): AssessmentRuntimeScope | null {
  if (!artifactId) return null;

  const store = createAssessmentStore({ artifactId, assessmentPort });
  if (initialSnapshot !== undefined) {
    hydrateAssessmentSnapshot(store, initialSnapshot);
  }
  return { artifactId, assessmentPort, store };
}

export function AssessmentRuntimeProvider({
  children,
  initialSnapshot,
}: {
  children?: ReactNode;
  initialSnapshot?: unknown;
}) {
  const { artifactId } = useScaffoldArtifactIdentity();
  const assessmentPort = useAssessmentPort();
  const [scope, setScope] = useState<AssessmentRuntimeScope | null>(() =>
    createAssessmentRuntimeScope(artifactId, assessmentPort, initialSnapshot),
  );
  let currentScope = scope;
  const scopeMatches = currentScope
    ? currentScope.artifactId === artifactId && currentScope.assessmentPort === assessmentPort
    : artifactId === null;

  if (!scopeMatches) {
    currentScope = createAssessmentRuntimeScope(artifactId, assessmentPort, initialSnapshot);
    setScope(currentScope);
  }

  return (
    <AssessmentStoreContext.Provider value={currentScope?.store ?? null}>
      {children}
    </AssessmentStoreContext.Provider>
  );
}

export function useAssessmentStoreApi(): AssessmentStoreApi | null {
  const store = useContext(AssessmentStoreContext);

  if (store === missingProvider) {
    throw new Error("Assessment store hooks must be used inside an AssessmentRuntimeProvider.");
  }

  return store;
}

export function useAssessmentStoreSelector<Selected>(
  selector: (state: AssessmentStore) => Selected,
): Selected {
  const store = useAssessmentStoreApi();

  if (!store) {
    throw new Error("Assessment store selectors require a valid runtime artifact identity.");
  }

  return useStore(store, selector);
}
