import {
  Checkbox as RadixCheckbox,
  Slider as RadixSlider,
  TextField as RadixTextField,
} from "@radix-ui/themes";
import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
} from "react";

import { cn } from "@/lib/cn";

export interface CourseAuthoringTextFieldProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixTextField.Root>,
  "className" | "color" | "highContrast" | "radius" | "size" | "variant"
> {
  className?: string;
}

/** Text field visibly embedded in authored Course content or a Course-owned overlay. */
export const CourseAuthoringTextField = forwardRef<
  ComponentRef<typeof RadixTextField.Root>,
  CourseAuthoringTextFieldProps
>(function CourseAuthoringTextField({ className, ...fieldProps }, forwardedRef) {
  return (
    <RadixTextField.Root
      ref={forwardedRef}
      {...fieldProps}
      className={cn("sc-course-authoring-text-field", className)}
      size="2"
      variant="surface"
    />
  );
});

export interface CourseCompletionCheckboxProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixCheckbox>,
  "className" | "color" | "highContrast" | "radius" | "size" | "variant"
> {
  className?: string;
  state?: "completed" | undefined;
}

/** Checklist completion control shared by Course authoring preview and learner runtime. */
export const CourseCompletionCheckbox = forwardRef<
  ComponentRef<typeof RadixCheckbox>,
  CourseCompletionCheckboxProps
>(function CourseCompletionCheckbox({ className, state, ...checkboxProps }, forwardedRef) {
  return (
    <RadixCheckbox
      ref={forwardedRef}
      {...checkboxProps}
      className={cn("sc-course-completion-checkbox", className)}
      data-course-state={state}
      size="2"
    />
  );
});

export interface CourseMediaSliderProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixSlider>,
  "aria-label" | "aria-valuetext" | "className" | "color" | "highContrast" | "radius"
> {
  ariaLabel: string;
  ariaValueText: string;
  className?: string;
}

/** Course media range control that applies its accessible name to the Radix thumb. */
export function CourseMediaSlider({
  ariaLabel,
  ariaValueText,
  className,
  ...sliderProps
}: CourseMediaSliderProps) {
  const rootRef = useRef<ComponentRef<typeof RadixSlider> | null>(null);

  useLayoutEffect(() => {
    const thumb = rootRef.current?.querySelector<HTMLElement>('[role="slider"]');
    if (!thumb) return;
    thumb.setAttribute("aria-label", ariaLabel);
    thumb.setAttribute("aria-valuetext", ariaValueText);
  }, [ariaLabel, ariaValueText]);

  return (
    <RadixSlider
      {...sliderProps}
      ref={rootRef}
      className={cn("sc-course-media-slider", className)}
    />
  );
}
