import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import "@/editor/bounded-containers/view/bounded-container.css";
import "./assessment-controls.css";
import "./assessment-problem-shell.css";

interface ProblemShellProps {
  isEditable: boolean;
  blockClass?: string;
  surfaceAttributes?: Record<string, string>;
  /** Problem children — title, instructions, prompt, choices, hints,
   *  summary feedback. Typically NodeViewContent. */
  children: ReactNode;
}

/**
 * Outer card shell for every assessment block. Per the DS Cards spec:
 * flat white card, 1px gray-200 border, 10px radius, no shadow at rest.
 * Hover darkens the border to ink (matches `Card` primitive behaviour).
 * The same chrome both modes — at runtime the section is the question
 * card; at author time it's the working surface the author edits inside.
 *
 * Private authoring metadata such as hints and summary feedback remains
 * in the document tree, while action chrome is owned by the nested
 * assessment_actions_group node.
 */
export function ProblemShell({
  isEditable,
  blockClass,
  children,
  surfaceAttributes,
}: ProblemShellProps) {
  return (
    <section
      data-assessment-shell=""
      data-editable={isEditable ? "true" : "false"}
      {...surfaceAttributes}
      className={cn("sc-assessment-shell", blockClass)}
    >
      {children}
    </section>
  );
}
