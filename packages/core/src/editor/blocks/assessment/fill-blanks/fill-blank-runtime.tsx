import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type Editor,
  type NodeViewProps,
} from "@tiptap/react";
import { useId, useMemo } from "react";

import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { findAncestorAssessmentBlockId } from "@/editor/assessment/shared/model/assessment-prosemirror";
import { useAssessmentRuntimeById } from "@/editor/assessment/shared/runtime/use-assessment-runtime";
import { assessmentResponseName } from "@/editor/assessment/shared/runtime/assessment-response-name";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { AssessmentFeedbackContentSchema, FillBlanksAssessmentSchema } from "@scaffold/contracts";
import type { FillBlankAttrs } from "@scaffold/contracts";

import {
  blankAttrsFromNode,
  createFillBlankNode,
  FILL_BLANKS_ASSESSMENT_OWNER_NODE_TYPES,
  isFillBlanksAssessmentOwnerNodeType,
} from "./fill-blank-shared";
import "./FillBlanks.css";

interface FillBlankAccessibilityState {
  answerView: "submitted" | "correct";
  hasFeedback: boolean;
  state: "correct" | "incorrect" | null;
  submitted: boolean;
  value: string;
}

export function describeFillBlankAccessibilityState({
  answerView,
  hasFeedback,
  state,
  submitted,
  value,
}: FillBlankAccessibilityState): string | null {
  const parts: string[] = [];

  if (answerView === "correct") {
    parts.push("Correct answer");
  } else if (state === "correct") {
    parts.push(submitted ? "Submitted answer, correct" : "Entered answer, correct");
  } else if (state === "incorrect") {
    parts.push(submitted ? "Submitted answer, incorrect" : "Entered answer, incorrect");
  } else if (value.trim().length > 0) {
    parts.push(submitted ? "Submitted answer" : "Entered answer");
  }

  if (hasFeedback && state !== null) {
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

  return (
    <RuntimeFillBlank
      blank={blank}
      editor={props.editor}
      HTMLAttributes={props.HTMLAttributes}
      pos={pos}
    />
  );
}

function RuntimeFillBlank({
  blank,
  editor,
  HTMLAttributes,
  pos,
}: {
  blank: FillBlankAttrs;
  editor: Editor;
  HTMLAttributes: NodeViewProps["HTMLAttributes"];
  pos: number | null;
}) {
  const authoredBlockId = findAncestorAssessmentBlockId(
    editor,
    pos ?? undefined,
    FILL_BLANKS_ASSESSMENT_OWNER_NODE_TYPES,
  );
  const assessment = useAssessmentRuntimeById(authoredBlockId, "fill-blanks");
  const problem = assessment?.interaction ?? null;
  const runtimeProblem = assessment?.problem ?? null;
  const submitted = runtimeProblem?.state.submitted ?? false;
  const answerKeyVisible = runtimeProblem?.answerKeyVisible ?? false;
  const answerView = runtimeProblem?.answerView ?? "submitted";
  const feedbackResult = runtimeProblem?.feedbackResult ?? null;
  const detail = feedbackResult?.items?.[blank.id] ?? null;
  const showFeedback =
    submitted ||
    answerKeyVisible ||
    (runtimeProblem?.state.feedbackMode === "immediate" && feedbackResult !== null);
  const locked = runtimeProblem?.interactionLocked ?? false;
  const givenValue = problem?.valueFor(blank.id) ?? "";
  const reveal = revealedBlankAnswer(runtimeProblem?.state.revealedAnswer?.answers, blank.id);
  const feedback = answerKeyVisible
    ? (reveal?.feedback ?? detail?.feedback ?? null)
    : (detail?.feedback ?? null);
  const parsedFeedback = AssessmentFeedbackContentSchema.safeParse(feedback);
  const expectedAnswer = answerKeyVisible
    ? (reveal?.value ?? expectedBlankAnswer(detail?.expected))
    : null;
  const displayedValue = answerView === "correct" && expectedAnswer ? expectedAnswer : givenValue;
  const state =
    answerView === "correct" && expectedAnswer
      ? "correct"
      : showFeedback && detail
        ? detail.correct
          ? "correct"
          : "incorrect"
        : null;
  const widthBasis = displayedValue || blank.placeholder.trim() || "Answer";

  const hasFeedback = showFeedback && parsedFeedback.success;
  const accessibilityDescription = describeFillBlankAccessibilityState({
    answerView,
    hasFeedback,
    state,
    submitted,
    value: displayedValue,
  });
  const generatedDescriptionId = useId();
  const descriptionId = accessibilityDescription ? generatedDescriptionId : undefined;
  const position = fillBlankDocumentPosition(editor, pos);
  const publicPlaceholder = blank.placeholder.trim();
  const fieldLabel = `Blank ${position.index} of ${position.total}${
    publicPlaceholder ? `, ${publicPlaceholder}` : ""
  }`;

  return (
    <NodeViewWrapper
      {...HTMLAttributes}
      as="span"
      data-node="fill-blank"
      contentEditable={false}
      className="sc-course-fill-blank"
      data-course-mode="runtime"
      data-has-feedback={hasFeedback ? "true" : "false"}
    >
      <input
        type="text"
        name={assessmentResponseName(authoredBlockId ?? "", blank.id)}
        value={displayedValue}
        readOnly={locked}
        tabIndex={locked ? -1 : undefined}
        required
        onInvalid={(event) => event.preventDefault()}
        onChange={(event) => problem?.setBlank(blank.id, event.target.value)}
        onBlur={() => problem?.commitImmediate()}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          problem?.commitImmediate();
        }}
        placeholder={blank.placeholder || "Answer"}
        aria-label={fieldLabel}
        aria-describedby={descriptionId}
        className="sc-course-fill-blank__input"
        data-course-state={state ?? "neutral"}
        data-review={answerView === "correct" ? "answer-key" : submitted ? "submitted" : "active"}
        style={{
          width: `${Math.max(16, Math.min(24, widthBasis.length + 4))}ch`,
        }}
      />
      {accessibilityDescription && (
        <span id={descriptionId} className="sc-sr-only">
          {accessibilityDescription}
        </span>
      )}
      {hasFeedback ? (
        <span className="sc-course-fill-blank__feedback-anchor">
          <RichFeedbackRuntimePopover
            feedback={parsedFeedback.data}
            triggerLabel={`Show feedback for blank ${position.index} of ${position.total}`}
          />
        </span>
      ) : null}
    </NodeViewWrapper>
  );
}

function expectedBlankAnswer(expected: unknown): string | null {
  const values =
    typeof expected === "string" ? [expected] : Array.isArray(expected) ? expected : [];
  return (
    values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ??
    null
  );
}

function revealedBlankAnswer(
  answers: unknown,
  blankId: string,
): { value: string; feedback: unknown } | null {
  const parsed = FillBlanksAssessmentSchema.safeParse(answers);
  if (!parsed.success) return null;
  const blank = parsed.data.blanks.find((candidate) => candidate.blankId === blankId);
  const value = blank?.acceptedAnswers.find((answer) => answer.trim().length > 0) ?? null;
  return value ? { value, feedback: parsed.data.feedbackByBlankId[blankId] ?? null } : null;
}

function fillBlankDocumentPosition(
  editor: Editor,
  pos: number | null,
): { index: number; total: number } {
  if (pos === null) return { index: 1, total: 1 };
  const resolved = editor.state.doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    const ancestor = resolved.node(depth);
    if (!isFillBlanksAssessmentOwnerNodeType(ancestor.type.name)) continue;
    const ancestorStart = resolved.start(depth);
    const positions: number[] = [];
    ancestor.descendants((node, offset) => {
      if (node.type.name === "fill_blank") positions.push(ancestorStart + offset);
    });
    const index = positions.indexOf(pos);
    return { index: Math.max(0, index) + 1, total: Math.max(1, positions.length) };
  }
  return { index: 1, total: 1 };
}
