import { expect, it } from "vite-plus/test";

import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";

import { createStructuralInteractionBubbleRendererMap } from "./structural-bubble-renderer-registry";

it("owns duplicate-safe structural renderer composition below the shell", () => {
  const renderer = () => null;
  const renderers = createStructuralInteractionBubbleRendererMap([
    { kind: InteractionTargetKind.Grid, renderer },
  ]);

  expect(renderers.get(InteractionTargetKind.Grid)).toBe(renderer);
  expect(() =>
    createStructuralInteractionBubbleRendererMap([
      { kind: InteractionTargetKind.Grid, renderer },
      { kind: InteractionTargetKind.Grid, renderer },
    ]),
  ).toThrow(/already bound/i);
});
