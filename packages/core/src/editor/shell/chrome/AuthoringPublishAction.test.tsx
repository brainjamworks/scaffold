// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ScaffoldAuthoringPublishState } from "../authoring/ScaffoldAuthoringApp";
import { AuthoringPublishAction } from "./AuthoringPublishAction";

const policyCases: ReadonlyArray<{
  readonly description?: string;
  readonly enabled: boolean;
  readonly label: string;
  readonly presentation: "primary" | "quiet";
  readonly state: ScaffoldAuthoringPublishState;
}> = [
  {
    state: "loading",
    label: "Publish",
    enabled: false,
    description: "Loading publication status.",
    presentation: "primary",
  },
  { state: "not-published", label: "Publish", enabled: true, presentation: "primary" },
  {
    state: "published",
    label: "Published",
    enabled: false,
    description: "This version is published.",
    presentation: "quiet",
  },
  { state: "unpublished", label: "Publish changes", enabled: true, presentation: "primary" },
  {
    state: "unsaved",
    label: "Publish",
    enabled: false,
    description: "Save changes before publishing.",
    presentation: "primary",
  },
  {
    state: "publishing",
    label: "Publishing…",
    enabled: false,
    description: "Publishing is in progress.",
    presentation: "primary",
  },
  {
    state: "invalid",
    label: "Publish",
    enabled: false,
    description: "Fix invalid content before publishing.",
    presentation: "primary",
  },
  {
    state: "unavailable-content",
    label: "Publish",
    enabled: false,
    description: "Unavailable content cannot be published.",
    presentation: "primary",
  },
  {
    state: "requires-scaffold-plus",
    label: "Publish",
    enabled: false,
    description: "Scaffold Plus is required to publish.",
    presentation: "primary",
  },
  {
    state: "unsupported-core-format",
    label: "Publish",
    enabled: false,
    description: "This document format cannot be published.",
    presentation: "primary",
  },
  {
    state: "projection-warning",
    label: "Publish",
    enabled: false,
    description: "Resolve projection warnings before publishing.",
    presentation: "primary",
  },
  {
    state: "payload-too-large",
    label: "Publish",
    enabled: false,
    description: "The publication is too large.",
    presentation: "primary",
  },
  {
    state: "stale-artifact-revision",
    label: "Publish",
    enabled: false,
    description: "Save the latest revision before publishing.",
    presentation: "primary",
  },
  {
    state: "forbidden",
    label: "Publish",
    enabled: false,
    description: "Publishing is not permitted.",
    presentation: "primary",
  },
  {
    state: "invalid-payload",
    label: "Publish",
    enabled: false,
    description: "The publication payload is invalid.",
    presentation: "primary",
  },
  {
    state: "error",
    label: "Publish",
    enabled: true,
    description: "Publishing failed. Try again.",
    presentation: "primary",
  },
];

describe("AuthoringPublishAction", () => {
  it.each(policyCases)(
    "presents $state through the Core publication policy",
    ({ description, enabled, label, presentation, state }) => {
      render(<AuthoringPublishAction onPublish={vi.fn()} publishState={state} />);

      const action = screen.getByRole("button", { name: label });
      expect(action).toHaveAttribute("aria-disabled", String(!enabled));
      expect(action).toHaveAttribute("data-presentation", presentation);
      expect(action).toHaveAttribute("data-publish-state", state);
      if (state === "publishing") {
        expect(action).toHaveAttribute("aria-busy", "true");
      } else {
        expect(action).not.toHaveAttribute("aria-busy");
      }

      if (description) {
        const descriptionId = action.getAttribute("aria-describedby");
        expect(descriptionId).not.toBeNull();
        expect(document.getElementById(descriptionId!)).toHaveTextContent(description);
      } else {
        expect(action).not.toHaveAttribute("aria-describedby");
      }
    },
  );

  it.each(["not-published", "unpublished", "error"] as const)(
    "activates the %s state",
    async (publishState) => {
      const user = userEvent.setup();
      const onPublish = vi.fn();
      render(<AuthoringPublishAction onPublish={onPublish} publishState={publishState} />);

      await user.click(screen.getByRole("button"));

      expect(onPublish).toHaveBeenCalledOnce();
    },
  );

  it("keeps a blocked action focusable and guards pointer and keyboard activation", async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    render(<AuthoringPublishAction onPublish={onPublish} publishState="forbidden" />);

    const action = screen.getByRole("button", { name: "Publish" });
    await user.tab();
    expect(action).toHaveFocus();
    await user.keyboard("{Enter} ");
    await user.click(action);

    expect(onPublish).not.toHaveBeenCalled();
    expect(action).toHaveAccessibleDescription("Publishing is not permitted.");
  });
});
