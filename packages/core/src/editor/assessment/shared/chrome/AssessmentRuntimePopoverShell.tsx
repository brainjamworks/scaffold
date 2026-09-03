import type { ReactNode } from "react";

import { CoursePopoverSurface } from "@/ui/components/course/CoursePopoverSurface/CoursePopoverSurface";

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
    <CoursePopoverSurface headerActions={headerActions} icon={icon} title={title} tone={tone}>
      {children}
    </CoursePopoverSurface>
  );
}
