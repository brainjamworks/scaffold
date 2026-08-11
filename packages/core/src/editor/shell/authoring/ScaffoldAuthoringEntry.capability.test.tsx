// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";

const testApplication = createScaffoldApplication();

vi.mock("./ScaffoldAuthoringApp", async () => {
  const { createElement } = await import("react");
  return {
    ScaffoldAuthoringApp: () => createElement("section", { "data-testid": "ready-authoring-app" }),
  };
});

vi.mock("./createAndPersistAuthoringArtifact", () => {
  throw new Error("artifact creation capability unavailable");
});

import { ScaffoldAuthoringEntry } from "./ScaffoldAuthoringEntry";

describe("ScaffoldAuthoringEntry capability failure", () => {
  it("distinguishes a creation-module failure from a retryable creation failure", async () => {
    const user = userEvent.setup();

    render(
      <ScaffoldAuthoringEntry
        application={testApplication}
        artifact={null}
        productAccess={{ scaffoldPlusAuthorized: false }}
        services={{
          artifactCreation: { createArtifactMetadata: vi.fn() },
          artifactPersistence: {
            saveArtifact: vi.fn(async () => ({ artifactRevision: "revision-created" })),
          },
          learnerPublication: {
            getStatus: vi.fn(async () => ({
              currentArtifactRevision: "revision-created",
              publishedArtifactRevision: null,
              publishedAt: null,
            })),
            publish: vi.fn(),
          },
          media: null,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create page" }));

    const unavailable = await screen.findByRole("alert", {
      name: "Document creation couldn’t load",
    });
    expect(unavailable.closest(".sc-app")).not.toBeNull();
    expect(unavailable.textContent).toContain("Reload this page to try again.");
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
    expect(screen.queryByText("Document could not be created. Try again.")).toBeNull();
  });
});
