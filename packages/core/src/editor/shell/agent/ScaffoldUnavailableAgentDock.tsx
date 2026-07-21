import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react";

import { Button } from "@/ui/components/Button/Button";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { Textarea } from "@/ui/components/Input/Input";
import { iconSm } from "@/ui/tokens/icon-sizes";

import { ScaffoldAgentDockEmptyState } from "./ScaffoldAgentDockEmptyState";
import { ScaffoldAgentDockFrame } from "./ScaffoldAgentDockFrame";

const SUGGESTION_PROMPTS = [
  "Plan a module",
  "Add a quick check",
  "Improve this explanation",
  "Turn this into a grid",
] as const;

export interface ScaffoldUnavailableAgentDockProps {
  onClose?: () => void;
}

export function ScaffoldUnavailableAgentDock({ onClose }: ScaffoldUnavailableAgentDockProps) {
  return (
    <ScaffoldAgentDockFrame
      connection="not-connected"
      footer={
        <form className="sc-authoring-agent-dock-form">
          <div className="sc-authoring-agent-dock-prompt-field" data-disabled="">
            <Textarea
              id="scaffold-agent-prompt"
              name="scaffold-agent-prompt"
              aria-label="Scaffold Agent prompt"
              className="sc-authoring-agent-dock-textarea"
              disabled
              placeholder="Type a prompt…"
            />
            <IconButton
              aria-label="Send to Scaffold Agent"
              variant="primary"
              size="md"
              type="submit"
              disabled
              className="sc-authoring-agent-dock-send"
            >
              <PaperPlaneTilt size={iconSm} />
            </IconButton>
          </div>
        </form>
      }
      {...(onClose ? { onClose } : {})}
    >
      <ScaffoldAgentDockEmptyState
        suggestions={SUGGESTION_PROMPTS.map((suggestion) => (
          <Button key={suggestion} variant="secondary" size="sm" type="button" disabled>
            {suggestion}
          </Button>
        ))}
      />
    </ScaffoldAgentDockFrame>
  );
}
