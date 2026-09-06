import { describe, expect, it } from "vite-plus/test";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import {
  INTERACTIONS_FIXTURE_IDS,
  createInteractionsFixtureContent,
  projectInteractionsFixture,
} from "@scaffold/core/format";

describe("interactions fixture", () => {
  it("retains the Course Document identity required for authoring", () => {
    const content = createInteractionsFixtureContent();
    expect(EmbeddedNodeIdSchema.safeParse(content.content?.[0]?.attrs?.["id"]).success).toBe(true);
  });
  it("parses and projects a non-empty Interactions surface for the content slide", () => {
    const { courseStructure, projection } = projectInteractionsFixture(
      createInteractionsFixtureContent(),
    );

    expect(courseStructure.kind).toBe("slideshow");
    if (courseStructure.kind !== "slideshow") return;
    expect(courseStructure.surfaceIds).toHaveLength(2);
    expect(courseStructure.surfaceIds).toContain(INTERACTIONS_FIXTURE_IDS.coverSurface);
    expect(courseStructure.surfaceIds).toContain(INTERACTIONS_FIXTURE_IDS.contentSurface);

    expect(projection.surfaceId).toBe(INTERACTIONS_FIXTURE_IDS.contentSurface);
    expect(projection.capabilityState).toBe("available");
    expect(projection.whenEvents.length).toBeGreaterThan(0);
    expect(projection.targetCommands.length).toBeGreaterThan(0);

    const ruleIds = projection.rules.map((rule) => rule.rule.id);
    expect(ruleIds).toContain(INTERACTIONS_FIXTURE_IDS.rule);
    const fixtureRule = projection.rules.find(
      (rule) => rule.rule.id === INTERACTIONS_FIXTURE_IDS.rule,
    );
    expect(fixtureRule?.diagnostics).toEqual([]);
  });
});
