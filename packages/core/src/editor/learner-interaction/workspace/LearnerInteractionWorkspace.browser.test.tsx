import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type LearnerInteractionRuleV1,
} from "@scaffold/contracts";
import { Result } from "better-result";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import type {
  LearnerInteractionAuthoringProjection,
  ProjectedLearnerInteractionRule,
} from "../model";
import { LearnerInteractionWorkspaceController } from "./learner-interaction-workspace-controller";
import { LearnerInteractionWorkspace } from "./LearnerInteractionWorkspace";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");

describe("LearnerInteractionWorkspace browser behavior", () => {
  it("keeps the exit decision keyboard-operable and scrolls within the bottom workspace", async () => {
    await page.viewport(900, 600);
    const host = document.createElement("div");
    host.style.height = "280px";
    host.style.position = "relative";
    document.body.append(host);
    const value = projection(14);
    const controller = new LearnerInteractionWorkspaceController({
      saveDraft: (draft) => Result.ok(draft.ruleId!),
    });
    const rendered = await renderBrowserReact(
      <LearnerInteractionWorkspace
        controller={controller}
        projection={value}
        onSetRuleEnabled={() => Result.ok()}
        onReorderRule={() => Result.ok()}
        onRemoveRule={() => Result.ok()}
      />,
      { container: host },
    );

    try {
      const list = host.querySelector<HTMLOListElement>(".sc-learner-interactions-list")!;
      expect(getComputedStyle(list).overflowY).toBe("auto");
      expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);

      await userEvent.click(page.getByRole("button", { name: "Edit Rule 1", exact: true }));
      await userEvent.click(page.getByLabelText("Rule enabled"));
      await userEvent.click(page.getByRole("button", { name: "Add rule" }));
      await expect
        .element(page.getByRole("alertdialog", { name: "Unsaved rule changes" }))
        .toBeVisible();
      await expect.poll(() => document.activeElement?.textContent?.trim()).toBe("Save changes");

      await userEvent.keyboard("{Tab}{Enter}");
      await expect.element(page.getByRole("heading", { name: "New rule" })).toBeVisible();
      expect(controller.getSnapshot()).toMatchObject({
        status: "focused-clean",
        draft: { ruleId: null, when: null, commands: [] },
      });
    } finally {
      controller.dispose();
      await rendered.unmount();
      host.remove();
    }
  });
});

function projection(ruleCount: number): LearnerInteractionAuthoringProjection {
  const event = Object.freeze({
    availability: "available" as const,
    targetId: TARGET_ID,
    targetLabel: "Target",
    type: "activated",
    label: "Activated",
  });
  const command = Object.freeze({ kind: "reveal-target" as const, targetId: TARGET_ID });
  const rules: readonly ProjectedLearnerInteractionRule[] = Array.from(
    { length: ruleCount },
    (_, index) => {
      const rule: LearnerInteractionRuleV1 = {
        id: EmbeddedDataIdSchema.parse(`rule${String(index).padStart(8, "0")}`),
        isEnabled: true,
        when: { targetId: TARGET_ID, type: "activated" },
        conditions: [],
        commands: [command],
      };
      return Object.freeze({
        rule,
        diagnostics: Object.freeze([]),
        when: Object.freeze({
          reference: rule.when,
          option: event,
          diagnostics: Object.freeze([]),
        }),
        conditions: Object.freeze([]),
        commands: Object.freeze([
          Object.freeze({
            kind: "reveal-target" as const,
            command,
            option: Object.freeze({
              availability: "available" as const,
              targetId: TARGET_ID,
              label: "Target",
            }),
            diagnostics: Object.freeze([]),
          }),
        ]),
      });
    },
  );
  return Object.freeze({
    surfaceId: SURFACE_ID,
    capabilityState: "available",
    rules: Object.freeze(rules),
    whenEvents: Object.freeze([event]),
    conditionStates: Object.freeze([]),
    targetCommands: Object.freeze([]),
    revealTargets: Object.freeze([
      Object.freeze({ availability: "available", targetId: TARGET_ID, label: "Target" }),
    ]),
    navigationSurfaces: Object.freeze([]),
  });
}
