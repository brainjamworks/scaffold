import {
  CaretDownIcon as CaretDown,
  CheckCircleIcon as CheckCircle,
  CheckIcon as Check,
  XCircleIcon as XCircle,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useId } from "react";

import type { ChoiceState } from "@/editor/assessment/shared/runtime/types";
import * as Select from "@/ui/components/Select/SelectMenu";
import * as VisuallyHidden from "@/ui/components/VisuallyHidden/VisuallyHidden";
import { zIndex } from "@/ui/overlays/z-index";
import { iconMd, iconSm, iconXs } from "@/ui/tokens/icon-sizes";

import "./DropdownCourseSelect.css";

export interface DropdownCourseOption {
  id: string;
  text: string;
  content: ReactNode;
}

interface DropdownCourseSelectProps {
  accessibilityDescription?: string | null;
  disabled: boolean;
  feedbackControl?: ReactNode;
  immediateAnnouncement?: string | null;
  label: string;
  name?: string | undefined;
  onValueChange: (value: string) => void;
  options: readonly DropdownCourseOption[];
  placeholder: string;
  promptHasText?: boolean;
  promptId?: string | undefined;
  state: ChoiceState | null;
  value: string;
}

/** Course-owned visible composition for Dropdown's distinct Select interaction. */
export function DropdownCourseSelect({
  accessibilityDescription,
  disabled,
  feedbackControl,
  immediateAnnouncement,
  label,
  name,
  onValueChange,
  options,
  placeholder,
  promptHasText = false,
  promptId,
  state,
  value,
}: DropdownCourseSelectProps) {
  const labelId = useId();
  const descriptionId = useId();
  const fallbackLabelId = useId();
  const selected = options.find((option) => option.id === value) ?? null;
  const courseState = state === "missed" ? "correct" : state;
  const usesPromptLabel = !label && promptHasText && Boolean(promptId);

  return (
    <div className="sc-course-dropdown-select">
      {label ? (
        <div id={labelId} className="sc-course-dropdown-select__label">
          {label}
        </div>
      ) : null}
      <div className="sc-course-dropdown-select__row">
        <Select.Root
          required
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          {...(name ? { name } : {})}
        >
          <Select.Trigger
            aria-labelledby={label ? labelId : usesPromptLabel ? promptId : fallbackLabelId}
            aria-describedby={accessibilityDescription ? descriptionId : undefined}
            className="sc-course-dropdown-select__trigger"
            data-course-state={courseState ?? undefined}
            data-locked={disabled || undefined}
          >
            <Select.Value placeholder={placeholder} className="sc-course-dropdown-select__value">
              {selected?.content}
            </Select.Value>
            <Select.Icon className="sc-course-dropdown-select__caret">
              <CaretDown size={iconXs} aria-hidden />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              position="popper"
              sideOffset={4}
              className="sc-course-dropdown-select__content"
              style={{ zIndex: zIndex.popover }}
            >
              <Select.Viewport className="sc-course-dropdown-select__viewport">
                {options.map((option) => (
                  <Select.Item
                    key={option.id}
                    value={option.id}
                    textValue={option.text}
                    className="sc-course-dropdown-select__item"
                  >
                    <Select.ItemText>{option.content}</Select.ItemText>
                    <Select.ItemIndicator className="sc-course-dropdown-select__item-indicator">
                      <Check size={iconSm} aria-hidden />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <span
          className="sc-course-dropdown-select__status"
          data-assessment-result-state={courseState ?? undefined}
        >
          {state === "correct" || state === "missed" ? (
            <span className="sc-course-dropdown-select__side-icon">
              <CheckCircle size={iconMd} weight="fill" aria-hidden />
            </span>
          ) : state === "incorrect" ? (
            <span className="sc-course-dropdown-select__side-icon">
              <XCircle size={iconMd} weight="fill" aria-hidden />
            </span>
          ) : null}
          {feedbackControl ? (
            <span className="sc-course-dropdown-select__feedback">{feedbackControl}</span>
          ) : null}
        </span>
        {accessibilityDescription ? (
          <VisuallyHidden.Root id={descriptionId}>{accessibilityDescription}</VisuallyHidden.Root>
        ) : null}
      </div>

      {immediateAnnouncement ? (
        <VisuallyHidden.Root role="status" aria-live="polite" aria-atomic="true">
          {immediateAnnouncement}
        </VisuallyHidden.Root>
      ) : null}
      {!label && !usesPromptLabel ? (
        <VisuallyHidden.Root id={fallbackLabelId}>Dropdown response</VisuallyHidden.Root>
      ) : null}
    </div>
  );
}
