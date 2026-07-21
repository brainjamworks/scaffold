import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import type { LearnerActivityPort } from "@/host/ports/learner-activity";
import { useLearnerActivityPort } from "@/host/providers/ScaffoldServicesProvider";
import { useScaffoldArtifactIdentity } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { hydrateLearnerActivitySnapshot } from "./hydration";
import { createLearnerActivityStore } from "./store";
import type { LearnerActivityStore, LearnerActivityStoreApi } from "./types";

const missingProvider = Symbol("missing LearnerActivityRuntimeProvider");

const LearnerActivityStoreContext = createContext<
  LearnerActivityStoreApi | null | typeof missingProvider
>(missingProvider);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface LearnerActivityRuntimeScope {
  readonly artifactId: string;
  readonly learnerActivityPort: LearnerActivityPort | null;
  readonly store: LearnerActivityStoreApi;
}

function createLearnerActivityRuntimeScope(
  artifactId: string | null,
  learnerActivityPort: LearnerActivityPort | null,
  initialSnapshot: unknown,
): LearnerActivityRuntimeScope | null {
  if (!artifactId) return null;

  const store = createLearnerActivityStore({ artifactId, learnerActivityPort });
  if (initialSnapshot !== undefined) {
    try {
      hydrateLearnerActivitySnapshot(store, initialSnapshot);
    } catch (error) {
      store.setState({ hydration: { status: "error", error: errorMessage(error) } });
    }
  }
  return { artifactId, learnerActivityPort, store };
}

export function LearnerActivityRuntimeProvider({
  children,
  initialSnapshot,
}: {
  children?: ReactNode;
  initialSnapshot?: unknown;
}) {
  const { artifactId } = useScaffoldArtifactIdentity();
  const learnerActivityPort = useLearnerActivityPort();
  const [scope, setScope] = useState<LearnerActivityRuntimeScope | null>(() =>
    createLearnerActivityRuntimeScope(artifactId, learnerActivityPort, initialSnapshot),
  );
  let currentScope = scope;
  const scopeMatches = currentScope
    ? currentScope.artifactId === artifactId &&
      currentScope.learnerActivityPort === learnerActivityPort
    : artifactId === null;

  if (!scopeMatches) {
    currentScope = createLearnerActivityRuntimeScope(
      artifactId,
      learnerActivityPort,
      initialSnapshot,
    );
    setScope(currentScope);
  }

  useEffect(() => {
    if (
      !currentScope ||
      currentScope.store.getState().hydration.status !== "loading" ||
      !currentScope.learnerActivityPort
    ) {
      return undefined;
    }

    const { store, learnerActivityPort: scopePort } = currentScope;
    let obsolete = false;

    void scopePort
      .load({ artifactId: currentScope.artifactId })
      .then((loaded) => {
        if (obsolete) return;
        if (loaded === null) {
          store.setState({ activities: {}, hydration: { status: "ready", error: null } });
          return;
        }
        hydrateLearnerActivitySnapshot(store, loaded);
      })
      .catch((error: unknown) => {
        if (obsolete) return;
        store.setState({ hydration: { status: "error", error: errorMessage(error) } });
      });

    return () => {
      obsolete = true;
    };
  }, [currentScope]);

  return (
    <LearnerActivityStoreContext.Provider value={currentScope?.store ?? null}>
      {children}
    </LearnerActivityStoreContext.Provider>
  );
}

export function LearnerActivityReadinessGate({ children }: { children?: ReactNode }) {
  const hydration = useScopedLearnerActivitySelector((state) => state.hydration);

  if (hydration.status === "loading") {
    return (
      <div data-testid="learner-activity-runtime-loading" role="status">
        Loading learner progress.
      </div>
    );
  }

  if (hydration.status === "error") {
    return (
      <div data-testid="learner-activity-runtime-error" role="alert">
        Learner progress is unavailable: {hydration.error}
      </div>
    );
  }

  return children;
}

export function useScopedLearnerActivityApi(): LearnerActivityStoreApi | null {
  const store = useContext(LearnerActivityStoreContext);

  if (store === missingProvider) {
    throw new Error(
      "Learner activity store hooks must be used inside a LearnerActivityRuntimeProvider.",
    );
  }

  return store;
}

export function useScopedLearnerActivitySelector<Selected>(
  selector: (state: LearnerActivityStore) => Selected,
): Selected {
  const store = useScopedLearnerActivityApi();

  if (!store) {
    throw new Error("Learner activity store selectors require a valid runtime artifact identity.");
  }

  return useStore(store, selector);
}
