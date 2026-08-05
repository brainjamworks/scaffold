import { XIcon as X } from "@phosphor-icons/react";

import { iconSm } from "@/ui/tokens/icon-sizes";

import "./matching-runtime-remove-action.css";

interface MatchingRuntimeRemoveActionProps {
  label: string;
  onAction: () => void;
}

/** Course-owned learner action for removing a placed matching response. */
export function MatchingRuntimeRemoveAction({
  label,
  onAction,
}: MatchingRuntimeRemoveActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className="sc-course-matching-remove-action"
      onClick={(event) => {
        event.stopPropagation();
        onAction();
      }}
    >
      <X size={iconSm} aria-hidden />
    </button>
  );
}
