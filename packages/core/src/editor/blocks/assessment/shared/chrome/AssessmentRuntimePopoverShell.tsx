import type { ReactNode } from "react";

import { PopoverSurface } from "@/ui/components/PopoverSurface/PopoverSurface";

interface AssessmentRuntimePopoverShellProps {
  children: ReactNode;
  headerActions?: ReactNode;
  icon: ReactNode;
  title: ReactNode;
  tone: "feedback" | "hint";
}

export function AssessmentRuntimePopoverShell({
  children,
  headerActions,
  icon,
  title,
  tone,
}: AssessmentRuntimePopoverShellProps) {
  return (
    <PopoverSurface headerActions={headerActions} icon={icon} title={title} tone={tone}>
      {children}
    </PopoverSurface>
  );
}
