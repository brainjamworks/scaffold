import { Button, IconButton } from "@radix-ui/themes";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import "./CoursePopoverActions.css";

export type CoursePopoverActionTone = "default" | "danger";

export interface CoursePopoverActionProps extends Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "className" | "color" | "size" | "style" | "type"
> {
  children: ReactNode;
  tone?: CoursePopoverActionTone;
}

/** Text-led action rendered inside a Course popover surface. */
export const CoursePopoverAction = forwardRef<HTMLButtonElement, CoursePopoverActionProps>(
  function CoursePopoverAction({ children, tone = "default", ...buttonProps }, forwardedRef) {
    return (
      <Button
        ref={forwardedRef}
        {...buttonProps}
        type="button"
        size="3"
        variant="ghost"
        className="sc-course-popover-action"
        data-tone={tone}
      >
        {children}
      </Button>
    );
  },
);

export interface CoursePopoverPagerProps extends Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "className" | "style"
> {
  children: ReactNode;
}

/** Groups adjacent Course popover navigation actions without owning navigation state. */
export const CoursePopoverPager = forwardRef<HTMLDivElement, CoursePopoverPagerProps>(
  function CoursePopoverPager({ children, ...groupProps }, forwardedRef) {
    return (
      <div ref={forwardedRef} {...groupProps} className="sc-course-popover-pager">
        {children}
      </div>
    );
  },
);

export interface CoursePopoverPagerActionProps extends Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "className" | "color" | "size" | "style" | "type"
> {
  children: ReactNode;
}

/** Compact icon action in a Course popover pager. */
export const CoursePopoverPagerAction = forwardRef<
  HTMLButtonElement,
  CoursePopoverPagerActionProps
>(function CoursePopoverPagerAction({ children, ...buttonProps }, forwardedRef) {
  return (
    <IconButton
      ref={forwardedRef}
      {...buttonProps}
      type="button"
      size="3"
      variant="ghost"
      className="sc-course-popover-pager__action"
    >
      {children}
    </IconButton>
  );
});
