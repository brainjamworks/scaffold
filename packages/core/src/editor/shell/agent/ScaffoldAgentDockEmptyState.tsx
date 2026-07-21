import type { ReactNode } from "react";

import { Mark } from "@/ui/components/Mark/Mark";

export interface ScaffoldAgentDockEmptyStateProps {
  suggestions: ReactNode;
}

export function ScaffoldAgentDockEmptyState({ suggestions }: ScaffoldAgentDockEmptyStateProps) {
  return (
    <div className="sc-authoring-agent-dock-empty">
      <Mark size={64} />
      <div className="sc-authoring-agent-dock-empty-copy">
        <p className="sc-authoring-agent-dock-empty-title">
          Draft, revise, or structure course content.
        </p>
        <p className="sc-authoring-agent-dock-empty-description">
          Drafts open in review before they touch the document.
        </p>
      </div>
      <div className="sc-authoring-agent-dock-suggestions">{suggestions}</div>
    </div>
  );
}
