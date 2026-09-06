import { EmbeddedDataIdSchema, EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  omittedActionIds,
  type PresentationCompilationDiagnostic,
} from "./presentation-compilation-diagnostic";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const OTHER_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00002");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");
const EARLIER = EmbeddedDataIdSchema.parse("action000001");
const LATER = EmbeddedDataIdSchema.parse("action000002");

const EVERY_VARIANT: readonly [PresentationCompilationDiagnostic, readonly string[]][] = [
  [
    {
      reason: "navigation-destination-not-current",
      surfaceId: SURFACE_ID,
      actionId: EARLIER,
      destinationSurfaceId: OTHER_SURFACE_ID,
    },
    [EARLIER],
  ],
  [
    { reason: "target-not-current", surfaceId: SURFACE_ID, actionId: EARLIER, targetId: TARGET_ID },
    [EARLIER],
  ],
  [
    {
      reason: "target-moved-to-another-surface",
      surfaceId: SURFACE_ID,
      currentSurfaceId: OTHER_SURFACE_ID,
      actionId: EARLIER,
      targetId: TARGET_ID,
    },
    [EARLIER],
  ],
  [
    {
      reason: "visual-capability-unavailable",
      surfaceId: SURFACE_ID,
      actionId: EARLIER,
      targetId: TARGET_ID,
      capability: "emphasize",
    },
    [EARLIER],
  ],
  [
    {
      reason: "same-target-timed-overlap",
      surfaceId: SURFACE_ID,
      targetId: TARGET_ID,
      earlierActionId: EARLIER,
      laterActionId: LATER,
    },
    [LATER],
  ],
];

describe("PresentationCompilationDiagnostic", () => {
  it.each(EVERY_VARIANT)(
    "addresses the omitted action for %o",
    (diagnostic: PresentationCompilationDiagnostic, expected: readonly string[]) => {
      const omitted = omittedActionIds(diagnostic);

      expect(omitted).toEqual(expected);
      expect(Object.isFrozen(omitted)).toBe(true);
    },
  );

  it("keeps the earlier overlap owner compiled and never blames it", () => {
    for (const [diagnostic] of EVERY_VARIANT) {
      if (!("earlierActionId" in diagnostic)) continue;
      expect(omittedActionIds(diagnostic)).not.toContain(diagnostic.earlierActionId);
    }
  });
});
