import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type LearnerInteractionRuleV1,
  type ScaffoldDocumentContent,
} from "@scaffold/contracts";
import { Result } from "better-result";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import type {
  LearnerInteractionAuthoringProjection,
  ProjectedLearnerInteractionRule,
} from "../model";
import type { LearnerInteractionTurnReport } from "@/learner-interaction/model";
import { LearnerInteractionWorkspaceController } from "./learner-interaction-workspace-controller";
import { LearnerInteractionWorkspace } from "./LearnerInteractionWorkspace";
import {
  LearnerInteractionPreviewController,
  LearnerInteractionPreviewPortOwner,
} from "../preview";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");

describe("LearnerInteractionWorkspace browser behavior", () => {
  it("previews a saved group, inspects its latest turn source and closes cleanly", async () => {
    const value = projection(1);
    const controller = new LearnerInteractionWorkspaceController({
      saveDraft: (draft) => Result.ok(draft.ruleId!),
    });
    const reportListener: {
      current: ((report: LearnerInteractionTurnReport) => void) | null;
    } = { current: null };
    const reportsPort = {
      subscribeReports(listener: (report: LearnerInteractionTurnReport) => void) {
        reportListener.current = listener;
        return () => {
          reportListener.current = null;
        };
      },
    };
    let previewOwner: LearnerInteractionPreviewPortOwner;
    previewOwner = new LearnerInteractionPreviewPortOwner({
      prepare: async () => {
        queueMicrotask(() => previewOwner.connect(reportsPort));
        return Result.ok();
      },
      close: () => undefined,
    });
    const previewController = new LearnerInteractionPreviewController({
      port: previewOwner,
      close: () => previewOwner.close(),
    });
    const rendered = await renderBrowserReact(
      <LearnerInteractionWorkspace
        controller={controller}
        projection={value}
        previewController={previewController}
        previewDocument={{} as ScaffoldDocumentContent}
        onSetRuleEnabled={() => Result.ok()}
        onReorderRule={() => Result.ok()}
        onRemoveRule={() => Result.ok()}
      />,
    );

    try {
      await userEvent.click(page.getByRole("button", { name: "Preview interactions" }));
      await expect
        .element(page.getByRole("button", { name: "Close interactions preview" }))
        .toBeVisible();
      reportListener.current?.({
        turnNumber: 1,
        event: { targetId: TARGET_ID, type: "activated" },
        ruleEvaluations: [{ kind: "matched", ruleId: value.rules[0]!.rule.id, conditions: [] }],
        commandExecutions: [
          {
            address: { ruleId: value.rules[0]!.rule.id, commandIndex: 0 },
            outcome: { kind: "succeeded" },
          },
        ],
        end: "completed",
      });
      await expect
        .element(page.getByRole("region", { name: "Latest interaction turn" }))
        .toHaveTextContent("Turn 1");

      await userEvent.click(page.getByRole("button", { name: "Inspect Rule 1 command 1" }));
      await expect.element(page.getByRole("heading", { name: "Rule 1" })).toBeVisible();
      await userEvent.click(page.getByRole("button", { name: "Close interactions preview" }));
      await expect
        .element(page.getByRole("region", { name: "Latest interaction turn" }))
        .not.toBeInTheDocument();
    } finally {
      controller.dispose();
      previewController.dispose();
      await rendered.unmount();
    }
  });

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
    const previewOwner = new LearnerInteractionPreviewPortOwner({
      prepare: async () => Result.ok(),
      close: () => undefined,
    });
    const previewController = new LearnerInteractionPreviewController({
      port: previewOwner,
      close: () => previewOwner.close(),
    });
    const rendered = await renderBrowserReact(
      <LearnerInteractionWorkspace
        controller={controller}
        projection={value}
        previewController={previewController}
        previewDocument={{} as ScaffoldDocumentContent}
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
      expect(host.getAttribute("aria-hidden")).toBe("true");

      await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
      await expect.poll(() => document.activeElement?.textContent?.trim()).toBe("Cancel change");
      await userEvent.keyboard("{Tab}");
      await expect.poll(() => document.activeElement?.textContent?.trim()).toBe("Save changes");

      await userEvent.keyboard("{Escape}");
      await expect
        .element(page.getByRole("alertdialog", { name: "Unsaved rule changes" }))
        .not.toBeInTheDocument();
      expect(controller.getSnapshot().status).toBe("focused-dirty");
      await expect.poll(() => document.activeElement?.textContent?.trim()).toBe("Add rule");

      await userEvent.click(page.getByRole("button", { name: "Add rule" }));
      await userEvent.keyboard("{Tab}{Enter}");
      await expect.element(page.getByRole("heading", { name: "New rule" })).toBeVisible();
      expect(controller.getSnapshot()).toMatchObject({
        status: "focused-clean",
        draft: { ruleId: null, when: null, commands: [] },
      });
    } finally {
      controller.dispose();
      previewController.dispose();
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
