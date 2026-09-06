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
import type { LearnerInteractionTurnReport } from "@/learner-interaction/model";
import type { AuthorPreviewReports } from "@/editor/shell/authoring/author-preview-session-controller";
import { LearnerInteractionWorkspaceController } from "./learner-interaction-workspace-controller";
import { LearnerInteractionWorkspace } from "./LearnerInteractionWorkspace";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");

describe("LearnerInteractionWorkspace browser behavior", () => {
  it("inspects reports from the App-owned Preview session and closes cleanly", async () => {
    await page.viewport(900, 600);
    const value = projection(1);
    const host = document.createElement("div");
    host.style.height = "240px";
    document.body.append(host);
    const controller = new LearnerInteractionWorkspaceController({
      saveDraft: (draft) => Result.ok(draft.ruleId!),
    });
    const reportListener: {
      current: ((report: LearnerInteractionTurnReport) => void) | null;
    } = { current: null };
    const previewReports: AuthorPreviewReports = {
      getSnapshot: () => ({ status: "ready", surfaceId: SURFACE_ID }),
      subscribe: () => () => undefined,
      subscribeReports(listener: (report: LearnerInteractionTurnReport) => void) {
        reportListener.current = listener;
        return () => {
          reportListener.current = null;
        };
      },
    };
    const rendered = await renderBrowserReact(
      <LearnerInteractionWorkspace
        controller={controller}
        projection={value}
        previewReports={previewReports}
        previewActive
        onSetRuleEnabled={() => Result.ok()}
        onReorderRule={() => Result.ok()}
        onRemoveRule={() => Result.ok()}
      />,
      { container: host },
    );

    try {
      await userEvent.click(page.getByRole("button", { name: "Edit Rule 1", exact: true }));
      const triggerGroup = host.querySelector<HTMLElement>(
        ".sc-learner-interactions-trigger-group",
      )!;
      const responseGroup = host.querySelector<HTMLElement>(
        ".sc-learner-interactions-response-group",
      )!;
      expect(triggerGroup.getBoundingClientRect().right).toBeLessThanOrEqual(
        responseGroup.getBoundingClientRect().left + 1,
      );
      expect(responseGroup.clientWidth).toBeGreaterThan(host.clientWidth * 0.5);
      const saveButton = page.getByRole("button", { name: "Save rule" }).element();
      expect(saveButton.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        host.getBoundingClientRect().bottom,
      );
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

      await userEvent.click(page.getByText("Turn 1 · Turn completed."));
      await userEvent.click(page.getByRole("button", { name: "Inspect Rule 1 command 1" }));
      await expect.element(page.getByRole("heading", { name: "Rule 1" })).toBeVisible();
      const editor = host.querySelector<HTMLElement>(".sc-learner-interactions-editor")!;
      const command = host.querySelector<HTMLElement>('[aria-label="Command 1 reveal target"]')!;
      expect(editor.clientHeight).toBeGreaterThanOrEqual(100);
      expect(command.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        editor.getBoundingClientRect().top,
      );
      expect(command.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        editor.getBoundingClientRect().bottom,
      );
      expect(command.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        host.getBoundingClientRect().bottom,
      );
      await page.viewport(460, 600);
      expect(responseGroup.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        triggerGroup.getBoundingClientRect().bottom,
      );
      expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
    } finally {
      controller.dispose();
      await rendered.unmount();
      host.remove();
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
    const previewReports = idlePreviewReports();
    const rendered = await renderBrowserReact(
      <LearnerInteractionWorkspace
        controller={controller}
        projection={value}
        previewReports={previewReports}
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
      const ruleEditor = host.querySelector<HTMLElement>(".sc-learner-interactions-editor")!;
      expect(ruleEditor.closest("li")).not.toBeNull();
      expect(ruleEditor.querySelector("fieldset > legend")?.textContent).not.toBe("If all");
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
      await rendered.unmount();
      host.remove();
    }
  });
});

function idlePreviewReports(): AuthorPreviewReports {
  return {
    getSnapshot: () => ({ status: "idle" }),
    subscribe: () => () => undefined,
    subscribeReports: () => () => undefined,
  };
}

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
