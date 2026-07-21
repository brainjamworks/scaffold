import { InfoIcon as Info } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import * as Popover from "@/ui/components/Popover/Popover";
import { renderRuntimeRichTextNode } from "@/editor/rich-text/runtime/render-rich-text";
import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";
import { isScaffoldRichTextDocumentEmpty, toTiptapRichTextDocument } from "@/schemas/rich-text";
import {
  AssessmentFeedbackContentSchema,
  type AssessmentFeedbackContent,
} from "@scaffold/contracts";
import { iconSm } from "@/ui/tokens/icon-sizes";

import { CHOICE_TRAILING_BTN } from "./ChoiceAnswerItem";
import { AssessmentRuntimePopoverShell } from "./AssessmentRuntimePopoverShell";
import "./assessment-feedback-popover.css";

interface RichFeedbackRuntimePopoverProps {
  feedback: AssessmentFeedbackContent | null | undefined;
  triggerLabel?: string;
  trigger?: ReactNode | ((state: { open: boolean; hasFeedback: boolean }) => ReactNode);
}

export function RichFeedbackRuntimePopover({
  feedback,
  trigger,
  triggerLabel,
}: RichFeedbackRuntimePopoverProps) {
  const parsed = AssessmentFeedbackContentSchema.safeParse(feedback);
  const document = parsed.success ? toTiptapRichTextDocument(parsed.data.document) : null;
  const hasFeedback = !isScaffoldRichTextDocumentEmpty(document);
  const [open, setOpen] = useState(false);

  if (!hasFeedback || !document) return null;

  const defaultTrigger = (
    <button
      type="button"
      aria-label={triggerLabel ?? "Show feedback"}
      onClick={(event) => event.stopPropagation()}
      data-no-select
      className={cn(CHOICE_TRAILING_BTN, "sc-assessment-feedback-trigger--visible")}
    >
      <Info size={iconSm} weight="fill" />
    </button>
  );
  const popoverTrigger =
    typeof trigger === "function" ? trigger({ open, hasFeedback }) : (trigger ?? defaultTrigger);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{popoverTrigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          aria-label="Feedback"
          style={{ zIndex: zIndex.popover }}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <AssessmentRuntimePopoverShell
            icon={<Info size={iconSm} weight="fill" />}
            title="Feedback"
            tone="feedback"
          >
            <div className="sc-assessment-feedback-rich-text sc-assessment-feedback-rich-text--runtime">
              {renderRuntimeRichTextNode(document)}
            </div>
          </AssessmentRuntimePopoverShell>
          <Popover.Arrow className="sc-assessment-feedback-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
