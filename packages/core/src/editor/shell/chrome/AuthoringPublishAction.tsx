import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react";
import { useId, type MouseEvent } from "react";

import type { ScaffoldAuthoringPublishState } from "@/editor/shell/authoring/authoring-publication-controller";
import { iconSm } from "@/ui/tokens/icon-sizes";

import "./AuthoringPublishAction.css";

interface AuthoringPublishPresentation {
  readonly description?: string;
  readonly enabled: boolean;
  readonly label: string;
  readonly presentation: "primary" | "quiet";
}

const authoringPublishPolicy = {
  loading: {
    label: "Publish",
    enabled: false,
    description: "Loading publication status.",
    presentation: "primary",
  },
  "not-published": { label: "Publish", enabled: true, presentation: "primary" },
  published: {
    label: "Published",
    enabled: false,
    description: "This version is published.",
    presentation: "quiet",
  },
  unpublished: { label: "Publish changes", enabled: true, presentation: "primary" },
  unsaved: {
    label: "Publish",
    enabled: false,
    description: "Save changes before publishing.",
    presentation: "primary",
  },
  publishing: {
    label: "Publishing…",
    enabled: false,
    description: "Publishing is in progress.",
    presentation: "primary",
  },
  invalid: {
    label: "Publish",
    enabled: false,
    description: "Fix invalid content before publishing.",
    presentation: "primary",
  },
  "unavailable-content": {
    label: "Publish",
    enabled: false,
    description: "Unavailable content cannot be published.",
    presentation: "primary",
  },
  "requires-scaffold-plus": {
    label: "Publish",
    enabled: false,
    description: "Scaffold Plus is required to publish.",
    presentation: "primary",
  },
  "unsupported-core-format": {
    label: "Publish",
    enabled: false,
    description: "This document format cannot be published.",
    presentation: "primary",
  },
  "projection-warning": {
    label: "Publish",
    enabled: false,
    description: "Resolve projection warnings before publishing.",
    presentation: "primary",
  },
  "payload-too-large": {
    label: "Publish",
    enabled: false,
    description: "The publication is too large.",
    presentation: "primary",
  },
  "stale-artifact-revision": {
    label: "Publish",
    enabled: false,
    description: "Save the latest revision before publishing.",
    presentation: "primary",
  },
  forbidden: {
    label: "Publish",
    enabled: false,
    description: "Publishing is not permitted.",
    presentation: "primary",
  },
  "invalid-payload": {
    label: "Publish",
    enabled: false,
    description: "The publication payload is invalid.",
    presentation: "primary",
  },
  error: {
    label: "Publish",
    enabled: true,
    description: "Publishing failed. Try again.",
    presentation: "primary",
  },
} as const satisfies Record<ScaffoldAuthoringPublishState, AuthoringPublishPresentation>;

export interface AuthoringPublishActionProps {
  readonly onPublish: () => void | Promise<boolean>;
  readonly publishState: ScaffoldAuthoringPublishState;
}

export function AuthoringPublishAction({ onPublish, publishState }: AuthoringPublishActionProps) {
  const descriptionId = useId();
  const policy: AuthoringPublishPresentation = authoringPublishPolicy[publishState];
  const publishing = publishState === "publishing";

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!policy.enabled) {
      event.preventDefault();
      return;
    }
    void onPublish();
  };

  return (
    <>
      <button
        aria-busy={publishing || undefined}
        aria-describedby={policy.description ? descriptionId : undefined}
        aria-disabled={!policy.enabled}
        className="sc-app-publish-action"
        data-presentation={policy.presentation}
        data-publish-state={publishState}
        onClick={handleClick}
        type="button"
      >
        {publishing ? (
          <CircleNotch
            aria-hidden
            className="sc-app-publish-action__spinner"
            size={iconSm}
            weight="bold"
          />
        ) : null}
        <span>{policy.label}</span>
      </button>
      {policy.description ? (
        <span className="sc-app-publish-action__description" id={descriptionId}>
          {policy.description}
        </span>
      ) : null}
    </>
  );
}
