import { createContext, useContext, useMemo, type ReactNode } from "react";

export interface ScaffoldArtifactIdentity {
  artifactId: string | null;
  hasUnsafeIdentity: boolean;
}

export interface ScaffoldArtifactIdentityProviderProps {
  artifactId?: string | null;
  children: ReactNode;
}

const unsafeIdentity: ScaffoldArtifactIdentity = {
  artifactId: null,
  hasUnsafeIdentity: true,
};

const ScaffoldArtifactIdentityContext = createContext<ScaffoldArtifactIdentity>(unsafeIdentity);

function normalizeArtifactId(artifactId: string | null | undefined): string | null {
  const trimmed = artifactId?.trim();
  return trimmed ? trimmed : null;
}

export function ScaffoldArtifactIdentityProvider({
  artifactId,
  children,
}: ScaffoldArtifactIdentityProviderProps) {
  const value = useMemo<ScaffoldArtifactIdentity>(() => {
    const normalizedArtifactId = normalizeArtifactId(artifactId);
    return {
      artifactId: normalizedArtifactId,
      hasUnsafeIdentity: !normalizedArtifactId,
    };
  }, [artifactId]);

  return (
    <ScaffoldArtifactIdentityContext.Provider value={value}>
      {children}
    </ScaffoldArtifactIdentityContext.Provider>
  );
}

export function useScaffoldArtifactIdentity(): ScaffoldArtifactIdentity {
  return useContext(ScaffoldArtifactIdentityContext);
}
