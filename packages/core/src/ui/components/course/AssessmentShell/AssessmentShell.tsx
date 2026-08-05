import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import "./AssessmentShell.css";

export interface AssessmentShellProps {
  editable: boolean;
  className?: string;
  surfaceAttributes?: Record<string, string>;
  children: ReactNode;
}

/**
 * Course-owned question surface shared by standalone assessment blocks.
 *
 * Editor integrations provide the content and block-specific class while this
 * component owns only the stable semantic and layout contract.
 */
export function AssessmentShell({
  editable,
  className,
  children,
  surfaceAttributes,
}: AssessmentShellProps) {
  return (
    <section
      data-assessment-shell=""
      data-editable={editable ? "true" : "false"}
      {...surfaceAttributes}
      className={cn("sc-course-assessment-shell", className)}
    >
      {children}
    </section>
  );
}
