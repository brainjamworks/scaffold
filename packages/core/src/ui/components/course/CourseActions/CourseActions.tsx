import {
  Button as RadixButton,
  IconButton as RadixIconButton,
  Tooltip as RadixTooltip,
} from "@radix-ui/themes";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

export type CourseActionEmphasis = "strong" | "outlined" | "muted" | "raised" | "quiet";
export type CourseActionSize = "compact" | "normal" | "large";

const emphasisVariants = {
  strong: "solid",
  outlined: "outline",
  muted: "soft",
  raised: "surface",
  quiet: "ghost",
} as const;

const actionSizes = {
  compact: "1",
  normal: "2",
  large: "3",
} as const;

export interface CourseButtonProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixButton>,
  "className" | "color" | "highContrast" | "radius" | "size" | "variant"
> {
  className?: string;
  emphasis?: CourseActionEmphasis;
  size?: CourseActionSize;
}

/** Course-owned text action. Feature classes may refine its local recipe. */
export const CourseButton = forwardRef<ComponentRef<typeof RadixButton>, CourseButtonProps>(
  function CourseButton(
    { className, emphasis = "strong", size = "normal", ...buttonProps },
    forwardedRef,
  ) {
    return (
      <RadixButton
        ref={forwardedRef}
        {...buttonProps}
        className={cn("sc-course-action", className)}
        data-course-emphasis={emphasis}
        size={actionSizes[size]}
        variant={emphasisVariants[emphasis]}
      />
    );
  },
);

export interface CourseIconButtonProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixIconButton>,
  "className" | "color" | "highContrast" | "radius" | "size" | "variant"
> {
  className?: string;
  emphasis?: CourseActionEmphasis;
  size?: CourseActionSize;
}

/** Course-owned icon-only action; callers retain responsibility for its accessible name. */
export const CourseIconButton = forwardRef<
  ComponentRef<typeof RadixIconButton>,
  CourseIconButtonProps
>(function CourseIconButton(
  { className, emphasis = "quiet", size = "normal", ...buttonProps },
  forwardedRef,
) {
  return (
    <RadixIconButton
      ref={forwardedRef}
      {...buttonProps}
      className={cn("sc-course-icon-action", className)}
      data-course-emphasis={emphasis}
      size={actionSizes[size]}
      variant={emphasisVariants[emphasis]}
    />
  );
});

export interface CourseTooltipProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixTooltip>,
  "className" | "content"
> {
  children: ReactNode;
  className?: string;
  content: ReactNode;
}

/** Course-owned tooltip surface for controls rendered inside the Course canvas. */
export function CourseTooltip({
  children,
  className,
  content,
  ...tooltipProps
}: CourseTooltipProps) {
  return (
    <RadixTooltip
      {...tooltipProps}
      className={cn("sc-course-tooltip", className)}
      content={content}
    >
      {children}
    </RadixTooltip>
  );
}
