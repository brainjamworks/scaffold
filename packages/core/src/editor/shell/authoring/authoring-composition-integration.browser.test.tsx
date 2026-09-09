import { Result } from "better-result";
import { fireEvent } from "@testing-library/react";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";
import {
  LearnerInteractionConfigurationV1Schema,
  PresentationConfigurationV1Schema,
} from "@scaffold/contracts";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import {
  createInteractionsFixtureArtifact,
  INTERACTIONS_FIXTURE_IDS,
} from "@/editor/learner-interaction/workspace/interactions-fixture";
import { createScaffoldDocumentContent } from "@/format/artifact";
import type { ArtifactSavePayload, LearnerPublicationPayload } from "@/host/ports";
import "@/styles/globals.css";

import { ScaffoldAuthoringApp } from "./ScaffoldAuthoringApp";

describe("Scaffold authoring composition integration", () => {
  it("binds the real document, save, publication, host and Preview Stage owners", async () => {
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) =>
      Result.ok({ artifactRevision: "integrated-save-revision" }),
    );
    const publish = vi.fn(async (payload: LearnerPublicationPayload) =>
      Result.ok({
        currentArtifactRevision: payload.sourceArtifactRevision,
        publishedArtifactRevision: payload.sourceArtifactRevision,
        publishedAt: "2026-09-06T05:30:00.000Z",
      }),
    );
    const rendered = await renderBrowserReact(
      <ScaffoldAuthoringApp
        application={createScaffoldApplication()}
        artifact={{
          id: "authoring-composition-integration",
          title: "Initial title",
          mode: "page",
          content: createScaffoldDocumentContent({
            mode: "page",
            surfaceId: "composepage1",
          }),
        }}
        productAccess={{ scaffoldPlusAuthorized: false }}
        services={{
          artifactPersistence: { saveArtifact },
          learnerPublication: {
            getStatus: async () =>
              Result.ok({
                currentArtifactRevision: "integrated-initial-revision",
                publishedArtifactRevision: null,
                publishedAt: null,
              }),
            publish,
          },
          media: null,
        }}
        hostHeaderActions={({ saveNow }) => ({
          utility: (
            <button type="button" onClick={() => void saveNow()}>
              Save current document
            </button>
          ),
        })}
      />,
    );

    try {
      const title = document.querySelector<HTMLInputElement>("#scaffold-document-title");
      if (!title) throw new Error("Expected the mounted document title input.");
      fireEvent.change(title, { target: { value: "Integrated title" } });
      await userEvent.click(page.getByRole("button", { name: "Save current document" }));

      await expect.poll(() => saveArtifact.mock.calls.length).toBe(1);
      expect(saveArtifact.mock.calls[0]?.[0].artifact.title).toBe("Integrated title");
      await expect
        .element(page.getByRole("button", { name: "Publish" }))
        .toHaveAttribute("aria-disabled", "false");

      await userEvent.click(page.getByRole("button", { name: "Switch to preview" }));
      await expect.element(page.getByRole("button", { name: "Switch to editing" })).toBeVisible();
      await expect.element(page.getByTestId("scaffold-runtime-host")).toBeVisible();
      expect(publish).not.toHaveBeenCalled();

      await userEvent.click(page.getByRole("button", { name: "Switch to editing" }));
      await expect.element(page.getByRole("button", { name: "Switch to preview" })).toBeVisible();
      await userEvent.click(page.getByRole("button", { name: "Publish" }));

      await expect.poll(() => publish.mock.calls.length).toBe(1);
      expect(publish.mock.calls[0]?.[0]).toMatchObject({
        sourceArtifactRevision: "integrated-save-revision",
        artifact: { title: "Integrated title" },
      });
      await expect.element(page.getByText("Publication complete")).toBeVisible();
      await expect.element(page.getByRole("button", { name: "Switch to preview" })).toBeVisible();
      expect(document.querySelector('[data-testid="scaffold-runtime-host"]')).toBeNull();
    } finally {
      await rendered.unmount();
    }
  });

  it("persists Timeline and Interaction Apply through the real paused Preview runtime", async () => {
    await page.viewport(1_440, 1_000);
    let savedArtifact: ArtifactSavePayload["artifact"] | null = null;
    const saveArtifact = vi.fn(async (payload: ArtifactSavePayload) => {
      savedArtifact = structuredClone(payload.artifact);
      return Result.ok({
        artifactRevision: `slideshow-save-${saveArtifact.mock.calls.length}`,
      });
    });
    const publish = vi.fn(async (_payload: LearnerPublicationPayload) =>
      Result.ok({
        currentArtifactRevision: "unused",
        publishedArtifactRevision: "unused",
        publishedAt: "2026-09-06T06:00:00.000Z",
      }),
    );
    const artifact = createSlideshowIntegrationArtifact();
    const renderApp = () =>
      renderBrowserReact(
        <ScaffoldAuthoringApp
          application={createScaffoldApplication()}
          artifact={savedArtifact ?? artifact}
          productAccess={{ scaffoldPlusAuthorized: false }}
          services={{
            artifactPersistence: { saveArtifact },
            learnerPublication: {
              getStatus: async () =>
                Result.ok({
                  currentArtifactRevision: "slideshow-initial-revision",
                  publishedArtifactRevision: null,
                  publishedAt: null,
                }),
              publish,
            },
            media: null,
          }}
          hostHeaderActions={({ saveNow }) => ({
            utility: (
              <button type="button" onClick={() => void saveNow()}>
                Save current slideshow
              </button>
            ),
          })}
        />,
      );

    let rendered = await renderApp();
    try {
      await openTimelineFromContentSurface();
      await userEvent.click(page.getByRole("button", { name: "Switch to preview" }));

      await expect.element(page.getByRole("button", { name: "Switch to editing" })).toBeVisible();
      await expect.element(page.getByRole("button", { name: "Play preview" })).toBeEnabled();
      await expect.element(page.getByRole("button", { name: "Play presentation" })).toBeEnabled();
      await expect
        .element(page.getByRole("slider", { name: "Timeline playhead" }))
        .toHaveAttribute("aria-valuenow", "0");

      await userEvent.click(page.getByRole("button", { name: "Play preview" }));
      await expect.element(page.getByRole("button", { name: "Pause preview" })).toBeVisible();
      await expect
        .poll(() =>
          Number(page.getByRole("slider", { name: "Timeline playhead" }).element().ariaValueNow),
        )
        .toBeGreaterThan(0);
      await userEvent.click(page.getByRole("button", { name: "Pause preview" }));

      fireEvent.change(
        requiredElement<HTMLSelectElement>(document, 'select[aria-label="Add effect to"]'),
        { target: { value: INTERACTIONS_FIXTURE_IDS.tabOne } },
      );
      await expect
        .poll(() => document.querySelector('select[name="actionType"]') !== null)
        .toBe(true);
      fireEvent.change(requiredElement<HTMLSelectElement>(document, 'select[name="actionType"]'), {
        target: { value: "animate:reveal" },
      });
      fireEvent.change(requiredElement<HTMLInputElement>(document, 'input[name="atMs"]'), {
        target: { value: "0" },
      });
      fireEvent.change(requiredElement<HTMLInputElement>(document, 'input[name="durationMs"]'), {
        target: { value: "1000" },
      });
      await userEvent.click(page.getByRole("button", { name: "Add action" }));

      await expect.element(page.getByRole("button", { name: "Switch to editing" })).toBeVisible();
      await expect.element(page.getByRole("button", { name: "Play preview" })).toBeEnabled();
      await expect
        .poll(() =>
          Number.parseFloat(runtimeTarget(INTERACTIONS_FIXTURE_IDS.tabOne)?.style.opacity ?? ""),
        )
        .toBe(0);
      const playhead = page.getByRole("slider", { name: "Timeline playhead" });
      await userEvent.click(playhead);
      await userEvent.keyboard("{Home}");
      for (let step = 0; step < 5; step += 1) await userEvent.keyboard("{ArrowRight}");
      await expect.element(playhead).toHaveAttribute("aria-valuenow", "500");
      await expect
        .poll(() => {
          const target = runtimeTarget(INTERACTIONS_FIXTURE_IDS.tabOne);
          return target ? Number.parseFloat(target.style.opacity) : 0;
        })
        .toBeCloseTo(0.5, 1);

      await userEvent.click(page.getByRole("tab", { name: "Interactions" }));
      await userEvent.click(page.getByRole("button", { name: "Edit Rule 1", exact: true }));
      await userEvent.click(page.getByLabelText("Rule enabled"));
      await userEvent.click(page.getByRole("button", { name: "Save rule" }));

      await expect.element(page.getByRole("button", { name: "Switch to editing" })).toBeVisible();
      await userEvent.click(page.getByRole("tab", { name: "Timeline" }));
      await expect.element(page.getByRole("button", { name: "Play preview" })).toBeEnabled();
      await expect
        .poll(() =>
          Number.parseFloat(runtimeTarget(INTERACTIONS_FIXTURE_IDS.tabOne)?.style.opacity ?? ""),
        )
        .toBe(0);

      await userEvent.click(page.getByRole("button", { name: "Save current slideshow" }));
      await expect.poll(() => savedArtifact).not.toBeNull();
      const persisted = requireSavedArtifact(savedArtifact);
      expectPersistedSlideshowConfiguration(persisted);

      const saveCountBeforeSimulation = saveArtifact.mock.calls.length;
      const contentBeforeSimulation = JSON.stringify(persisted.content);
      const runtimeTabOne = runtimeTab("Tab 1");
      const runtimeTabTwo = runtimeTab("Tab 2");
      fireEvent.click(runtimeTabTwo);
      await expect.element(runtimeTabTwo).toHaveAttribute("aria-selected", "true");
      fireEvent.click(runtimeTabOne);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await expect.element(runtimeTabOne).toHaveAttribute("aria-selected", "true");
      fireEvent.click(runtimeTabTwo);
      await expect.element(runtimeTabTwo).toHaveAttribute("aria-selected", "true");
      await userEvent.click(page.getByRole("button", { name: "Play preview" }));
      await expect.element(page.getByRole("button", { name: "Pause preview" })).toBeVisible();
      await userEvent.click(page.getByRole("button", { name: "Pause preview" }));
      await new Promise((resolve) => setTimeout(resolve, 750));
      expect(saveArtifact).toHaveBeenCalledTimes(saveCountBeforeSimulation);
      expect(JSON.stringify(requireSavedArtifact(savedArtifact).content)).toBe(
        contentBeforeSimulation,
      );
      expect(publish).not.toHaveBeenCalled();

      await userEvent.click(page.getByRole("button", { name: "Switch to editing" }));
      await expect.element(page.getByRole("button", { name: "Switch to preview" })).toBeVisible();
      await rendered.unmount();
      rendered = await renderApp();

      await openTimelineFromContentSurface();
      const reloadedAction = requiredElement<HTMLButtonElement>(
        document,
        '.sc-presentation-timeline-action[aria-label^="Reveal"]',
      );
      await userEvent.click(reloadedAction);
      expect(requiredElement<HTMLSelectElement>(document, 'select[name="recipe"]').value).toBe(
        "fade",
      );
      expect(requiredElement<HTMLInputElement>(document, 'input[name="atMs"]').value).toBe("0");
      expect(requiredElement<HTMLInputElement>(document, 'input[name="durationMs"]').value).toBe(
        "1000",
      );
      await userEvent.click(page.getByRole("tab", { name: "Interactions" }));
      await userEvent.click(page.getByRole("button", { name: "Edit Rule 1", exact: true }));
      await expect.element(page.getByLabelText("Rule enabled")).not.toBeChecked();

      await userEvent.click(page.getByRole("button", { name: "Switch to preview" }));
      await expect.element(page.getByRole("button", { name: "Switch to editing" })).toBeVisible();
      await expect.element(page.getByRole("button", { name: "Play presentation" })).toBeEnabled();
      await expect.element(runtimeTab("Tab 1")).toHaveAttribute("aria-selected", "true");
      await expect.element(runtimeTab("Tab 2")).toHaveAttribute("aria-selected", "false");
      expect(publish).not.toHaveBeenCalled();
    } finally {
      await rendered.unmount();
    }
  });
});

function createSlideshowIntegrationArtifact() {
  const artifact = createInteractionsFixtureArtifact();
  const courseDocument = artifact.content.content?.[0];
  if (courseDocument?.type !== "courseDocument") {
    throw new Error("Expected the interactions fixture Course Document.");
  }
  courseDocument.attrs = {
    ...courseDocument.attrs,
    presentation: PresentationConfigurationV1Schema.parse({
      schemaVersion: 1,
      autoAdvance: false,
      allowPrevious: true,
      surfaces: [
        {
          surfaceId: INTERACTIONS_FIXTURE_IDS.coverSurface,
          durationMs: 5_000,
          layerTracks: [],
          actions: [],
        },
        {
          surfaceId: INTERACTIONS_FIXTURE_IDS.contentSurface,
          durationMs: 5_000,
          layerTracks: [],
          actions: [],
        },
      ],
    }),
  };
  return artifact;
}

async function openTimelineFromContentSurface(): Promise<void> {
  const selector = `[data-authoring-frame="surface"][data-id="${INTERACTIONS_FIXTURE_IDS.contentSurface}"]`;
  await expect.poll(() => document.querySelector(selector) !== null).toBe(true);
  fireEvent.mouseDown(requiredElement<HTMLElement>(document, selector));
  const surfaceOptions = page.getByRole("button", { name: "Surface options" });
  await expect.element(surfaceOptions).toBeVisible();
  await userEvent.click(surfaceOptions);
  await userEvent.click(page.getByRole("button", { name: "Open timeline" }));
  await expect
    .element(page.getByRole("tab", { name: "Timeline" }))
    .toHaveAttribute("aria-selected", "true");
  fireEvent.change(
    requiredElement<HTMLSelectElement>(document, 'select[aria-label="Workspace slide"]'),
    {
      target: { value: INTERACTIONS_FIXTURE_IDS.contentSurface },
    },
  );
  await expect
    .poll(
      () =>
        requiredElement<HTMLSelectElement>(document, 'select[aria-label="Workspace slide"]').value,
    )
    .toBe(INTERACTIONS_FIXTURE_IDS.contentSurface);
}

function runtimeTarget(targetId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-testid="scaffold-runtime-host"] [data-presentation-target-id="${targetId}"]`,
  );
}

function requiredElement<T extends Element>(container: ParentNode, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector}.`);
  return element;
}

function runtimeTab(name: string): HTMLElement {
  const runtime = requiredElement<HTMLElement>(document, '[data-testid="scaffold-runtime-host"]');
  const tab = Array.from(runtime.querySelectorAll<HTMLElement>('[role="tab"]')).find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (!tab) throw new Error(`Expected runtime tab "${name}".`);
  return tab;
}

function requireSavedArtifact(
  artifact: ArtifactSavePayload["artifact"] | null,
): ArtifactSavePayload["artifact"] {
  if (!artifact) throw new Error("Expected an in-memory saved artifact.");
  return artifact;
}

function expectPersistedSlideshowConfiguration(artifact: ArtifactSavePayload["artifact"]): void {
  const attrs = artifact.content.content?.[0]?.attrs;
  const presentation = PresentationConfigurationV1Schema.parse(attrs?.["presentation"]);
  const action = presentation.surfaces.find(
    ({ surfaceId }) => surfaceId === INTERACTIONS_FIXTURE_IDS.contentSurface,
  )?.actions[0];
  expect(action).toMatchObject({ kind: "animate", atMs: 0 });
  if (action?.kind !== "animate" || action.visual.kind !== "reveal") {
    throw new Error("Expected the persisted Reveal action.");
  }
  expect(action.visual.transition).toMatchObject({ kind: "fade", durationMs: 1_000 });

  const interactions = LearnerInteractionConfigurationV1Schema.parse(
    attrs?.["learnerInteractions"],
  );
  expect(interactions.surfaces[0]?.rules[0]).toMatchObject({
    id: INTERACTIONS_FIXTURE_IDS.rule,
    isEnabled: false,
  });
}
