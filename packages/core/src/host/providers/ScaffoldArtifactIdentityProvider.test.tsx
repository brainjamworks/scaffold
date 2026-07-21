// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import {
  ScaffoldArtifactIdentityProvider,
  useScaffoldArtifactIdentity,
} from "./ScaffoldArtifactIdentityProvider";

function IdentityProbe() {
  const identity = useScaffoldArtifactIdentity();

  return (
    <>
      <p data-testid="artifact-id">{identity.artifactId ?? "missing"}</p>
      <p data-testid="unsafe">{identity.hasUnsafeIdentity ? "unsafe" : "safe"}</p>
    </>
  );
}

describe("ScaffoldArtifactIdentityProvider", () => {
  it("provides trimmed artifact identity to shared consumers", () => {
    render(
      <ScaffoldArtifactIdentityProvider artifactId=" artifact-1 ">
        <IdentityProbe />
      </ScaffoldArtifactIdentityProvider>,
    );

    expect(screen.getByTestId("artifact-id").textContent).toBe("artifact-1");
    expect(screen.getByTestId("unsafe").textContent).toBe("safe");
  });

  it("reports unsafe identity when artifact identity is missing", () => {
    render(
      <ScaffoldArtifactIdentityProvider artifactId=" ">
        <IdentityProbe />
      </ScaffoldArtifactIdentityProvider>,
    );

    expect(screen.getByTestId("artifact-id").textContent).toBe("missing");
    expect(screen.getByTestId("unsafe").textContent).toBe("unsafe");
  });
});
