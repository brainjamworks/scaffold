import { type ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Mark } from "../Mark/Mark";

import "./EmptyState.css";

interface EmptyStateProps {
  /** Short headline — one line, ink colour. */
  title: string;
  /** Single-sentence helper copy. */
  description?: string;
  /** Optional action (a Button / Link / etc.) rendered on the right. */
  action?: ReactNode;
  /** Which surface this empty state sits on — drives Mark colours. */
  surface?: "light" | "dark" | "navy";
  className?: string;
}

/**
 * Empty-state moment inside the editor. Block-slot Mark + copy +
 * optional action. Used everywhere a block has nothing to show yet —
 * "Add the next block", "No hints yet", "Upload an image to draw
 * hotspots on", etc.
 *
 * The Mark itself is the brand moment that turns "nothing here" into
 * "scaffold is a block editor — add a block." The dashed top-right
 * slot reads literally as "add next block." Don't render an empty
 * state without it.
 *
 * Per `brand/DESIGN-SYSTEM.md`.
 */
export function EmptyState({
  title,
  description,
  action,
  surface = "light",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn("sc-empty-state", className)}
      data-scaffold-empty-state=""
      data-surface={surface}
    >
      <Mark surface={surface} size={36} />
      <div className="sc-empty-state-copy">
        <div className="sc-empty-state-title">{title}</div>
        {description && <div className="sc-empty-state-description">{description}</div>}
      </div>
      {action && <div className="sc-empty-state-action">{action}</div>}
    </div>
  );
}
