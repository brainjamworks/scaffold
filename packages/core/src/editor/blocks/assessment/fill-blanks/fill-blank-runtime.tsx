import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type Editor,
  type NodeViewProps,
} from "@tiptap/react";
import { useMemo } from "react";

import { findAncestorAssessmentId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { cn } from "@/lib/cn";
import { FillBlanksAssessmentSchema } from "@scaffold/contracts";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import type { FillBlankAttrs } from "@scaffold/contracts";

import { blankAttrsFromNode, createFillBlankNode } from "./fill-blank-shared";
import "./FillBlanks.css";

interface FillBlankAccessibilityState {
  hasFeedback: boolean;
  revealed: boolean;
  state: "correct" | "incorrect" | null;
  submitted: boolean;
  value: string;
}

export function describeFillBlankAccessibilityState({
  hasFeedback,
  revealed,
  state,
  submitted,
  value,
}: FillBlankAccessibilityState): string | null {
  const parts: string[] = [];

  if (revealed) {
    parts.push("Revealed answer, correct");
  } else if (state === "correct") {
    parts.push(submitted ? "Submitted answer, correct" : "Entered answer, correct");
  } else if (state === "incorrect") {
    parts.push(submitted ? "Submitted answer, incorrect" : "Entered answer, incorrect");
  } else if (value.trim().length > 0) {
    parts.push(submitted ? "Submitted answer" : "Entered answer");
  }

  if (hasFeedback && (revealed || state !== null)) {
    parts.push("Feedback available");
  }

  return parts.length > 0 ? parts.join(". ") : null;
}

export const FillBlankRuntimeNode = createFillBlankNode({
  addNodeView: () => ReactNodeViewRenderer(FillBlankRuntimeNodeView, { as: "span" }),
});

function FillBlankRuntimeNodeView(props: NodeViewProps) {
  const blank = useMemo(() => blankAttrsFromNode(props.node.attrs), [props.node.attrs]);
  const rawPos = typeof props.getPos === "function" ? safeGetPos(props.getPos) : null;
  const pos = typeof rawPos === "number" ? rawPos : null;

  return <RuntimeFillBlank blank={blank} editor={props.editor} pos={pos} />;
}

function RuntimeFillBlank({
  blank,
  editor,
  pos,
}: {
  blank: FillBlankAttrs;
  editor: Editor;
  pos: number | null;
}) {
  const problemId = findAncestorAssessmentId(editor, pos ?? undefined, ["fill_blanks"]);
  const assessment = useAssessmentRuntimeById(problemId, "fill-blanks");
  const problem = assessment?.interaction ?? null;
  const runtimeProblem = assessment?.problem ?? null;
  const submitted = runtimeProblem?.state.submitted ?? false;
  const answerKeyVisible = runtimeProblem?.answerKeyVisible ?? false;
  const hasRevealPayload = (runtimeProblem?.state.revealedAnswer ?? null) !== null;
  const feedbackResult = runtimeProblem?.feedbackResult ?? null;
  const detail = feedbackResult?.items?.[blank.id] ?? null;
  const showFeedback =
    submitted ||
    answerKeyVisible ||
    (runtimeProblem?.state.feedbackMode === "immediate" && feedbackResult !== null);
  const locked = submitted || hasRevealPayload || (runtimeProblem?.exhausted ?? false);
  const reveal = revealedBlankAnswer(runtimeProblem?.state.revealedAnswer?.answers, blank.id);
  const displayedValue =
    answerKeyVisible && reveal ? reveal.value : (problem?.valueFor(blank.id) ?? "");
  const state =
    answerKeyVisible && reveal
      ? "correct"
      : showFeedback && detail
        ? detail.correct
          ? "correct"
          : "incorrect"
        : null;
  const feedback = answerKeyVisible ? (reveal?.feedback ?? null) : (detail?.feedback ?? null);
  const parsedFeedback = AssessmentFeedbackContentSchema.safeParse(feedback);
  const widthBasis = displayedValue || blank.placeholder || "Answer";

  const hasInlineFeedback = showFeedback && parsedFeedback.success;
  const accessibilityDescription = describeFillBlankAccessibilityState({
    hasFeedback: hasInlineFeedback,
    revealed: answerKeyVisible && reveal !== null,
    state,
    submitted,
    value: displayedValue,
  });
  const descriptionId =
    problemId && accessibilityDescription ? `${problemId}:${blank.id}:description` : undefined;

  return (
    <NodeViewWrapper
      as="span"
      data-node="fill-blank"
      data-blank-id={blank.id}
      contentEditable={false}
      className="sc-fill-blank sc-fill-blank--runtime"
    >
      <input
        type="text"
        value={displayedValue}
        disabled={locked}
        onChange={(event) => problem?.setBlank(blank.id, event.target.value)}
        placeholder={blank.placeholder || "Answer"}
        aria-label={blank.placeholder || "Fill in blank"}
        aria-describedby={descriptionId}
        className={cn(
          "sc-fill-blank__input",
          state === "correct" && "sc-fill-blank__input--correct",
          state === "incorrect" && "sc-fill-blank__input--incorrect",
          hasInlineFeedback
            ? "sc-fill-blank__input--with-feedback"
            : "sc-fill-blank__input--without-feedback",
        )}
        style={{
          width: `${Math.max(
            8,
            Math.min(24, widthBasis.length + 4 + (hasInlineFeedback ? 2 : 0)),
          )}ch`,
        }}
      />
      {accessibilityDescription && (
        <span id={descriptionId} className="sc-sr-only">
          {accessibilityDescription}
        </span>
      )}
      {hasInlineFeedback && (
        <span className="sc-fill-blank__feedback-anchor">
          <RichFeedbackRuntimePopover feedback={parsedFeedback.data} />
        </span>
      )}
    </NodeViewWrapper>
  );
}

function revealedBlankAnswer(
  answers: unknown,
  blankId: string,
): { value: string; feedback: unknown } | null {
  const parsed = FillBlanksAssessmentSchema.safeParse(answers);
  if (!parsed.success) return null;
  const blank = parsed.data.blanks.find((candidate) => candidate.blankId === blankId);
  const value = blank?.acceptedAnswers.find((answer) => answer.length > 0) ?? null;
  return value ? { value, feedback: parsed.data.feedbackByBlankId[blankId] ?? null } : null;
}
