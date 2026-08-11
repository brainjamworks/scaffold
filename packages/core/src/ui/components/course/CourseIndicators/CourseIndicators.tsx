import { Badge as RadixBadge, Progress as RadixProgress } from "@radix-ui/themes";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

export interface CourseProgressMeterProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixProgress>,
  "aria-label" | "className" | "color" | "highContrast" | "radius" | "size" | "variant"
> {
  className?: string;
  label: string;
}

/** Course-owned determinate learning progress indicator. */
export const CourseProgressMeter = forwardRef<
  ComponentRef<typeof RadixProgress>,
  CourseProgressMeterProps
>(function CourseProgressMeter({ className, label, ...progressProps }, forwardedRef) {
  return (
    <RadixProgress
      ref={forwardedRef}
      {...progressProps}
      aria-label={label}
      className={cn("sc-course-progress-meter", className)}
    />
  );
});

export type CourseStatusBadgeState = "available" | "completed";

export interface CourseStatusBadgeProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixBadge>,
  "children" | "className" | "color" | "highContrast" | "radius" | "size" | "variant"
> {
  children: ReactNode;
  className?: string;
  state: CourseStatusBadgeState;
}

/** Compact Course status whose state is expressed semantically for the active design recipe. */
export const CourseStatusBadge = forwardRef<
  ComponentRef<typeof RadixBadge>,
  CourseStatusBadgeProps
>(function CourseStatusBadge({ children, className, state, ...badgeProps }, forwardedRef) {
  return (
    <RadixBadge
      ref={forwardedRef}
      {...badgeProps}
      className={cn("sc-course-status-badge", className)}
      data-course-state={state}
    >
      {children}
    </RadixBadge>
  );
});
