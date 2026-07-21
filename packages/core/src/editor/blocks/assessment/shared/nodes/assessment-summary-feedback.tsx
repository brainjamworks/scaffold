import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { InfoIcon as Info } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef } from "react";

import {
  readAssessmentFeedbackContent,
  resolveAssessmentAttrParent,
  richTextDocumentToAssessmentFeedback,
  setAssessmentAttr,
} from "../model/private-assessment-attrs";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import { EditableOverlayPopover } from "@/editor/rich-text/authoring/nested-overlay/EditableOverlayPopoverShell";
import { cn } from "@/lib/cn";
import {
  isScaffoldRichTextDocumentEmpty,
  toTiptapRichTextDocument,
  type ScaffoldRichTextDocument,
} from "@/schemas/rich-text";
import type { AssessmentFeedbackContent } from "@scaffold/contracts";
import { iconSm } from "@/ui/tokens/icon-sizes";

import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import "./assessment-shared-chrome.css";

/**
 * Post-submission summary feedback mount. The rich feedback document
 * is private assessment data stored on the ancestor assessment block's
 * attrs.assessment.summaryFeedback, not this node's content.
 *
 * The authoring node renders an action trigger that opens the attr-backed
 * editor. Runtime uses `AssessmentSummaryFeedbackRuntimeNode`.
 */
export const AssessmentSummaryFeedbackNode = Node.create({
  name: "assessment_summary_feedback",
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="assessment-summary-feedback"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "assessment-summary-feedback",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssessmentSummaryFeedbackNodeView);
  },
});

function AssessmentSummaryFeedbackNodeView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const popoverId = useId();
  const richTextPluginKey = useMemo(
    () => `assessment-summary-feedback-rich-text-${popoverId.replace(/[^A-Za-z0-9_-]/g, "")}`,
    [popoverId],
  );
  const latestTargetContext = useRef({ editor: props.editor, getPos: props.getPos });

  const pos = safeGetPos(props.getPos);
  const assessmentParent =
    typeof pos === "number" ? resolveAssessmentAttrParent(props.editor, pos) : null;
  const problemId = readStringAttr(assessmentParent?.node.attrs["id"]);
  const authorFeedback = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = safeGetPos(props.getPos);
      return typeof currentPos === "number"
        ? readSummaryFeedbackFromParent(editor, currentPos)
        : null;
    },
  });
  const hasFeedback = !isScaffoldRichTextDocumentEmpty(authorFeedback?.document);
  const fieldKey = `${problemId ?? "assessment"}:summary-feedback`;
  const extensions = useMemo(
    () => [
      ...createFieldContentEditorExtensions(),
      Placeholder.configure({
        includeChildren: false,
        placeholder: "Summary feedback",
        showOnlyCurrent: false,
        showOnlyWhenEditable: true,
      }),
    ],
    [],
  );

  useEffect(() => {
    latestTargetContext.current = { editor: props.editor, getPos: props.getPos };
  }, [props.editor, props.getPos]);

  const target = useMemo(
    () => ({
      kind: "attr" as const,
      read: () => {
        const latest = latestTargetContext.current;
        const currentPos = safeGetPos(latest.getPos);
        return typeof currentPos === "number"
          ? toTiptapRichTextDocument(
              readSummaryFeedbackFromParent(latest.editor, currentPos)?.document,
            )
          : null;
      },
      write: (nextDocument: ScaffoldRichTextDocument) => {
        const latest = latestTargetContext.current;
        const currentPos = safeGetPos(latest.getPos);
        if (typeof currentPos !== "number") return;
        setSummaryFeedbackOnParent(latest.editor, currentPos, nextDocument);
      },
    }),
    [],
  );

  if (!isEditable) {
    return (
      <NodeViewWrapper
        data-slot="assessment-summary-feedback"
        className="sc-assessment-field--hidden"
        contentEditable={false}
      ></NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      data-slot="assessment-summary-feedback"
      className="sc-assessment-summary-feedback-author"
      contentEditable={false}
    >
      <EditableOverlayPopover.Root>
        <EditableOverlayPopover.Trigger asChild>
          {renderSummaryFeedbackActionTrigger({ hasFeedback })}
        </EditableOverlayPopover.Trigger>
        <EditableOverlayPopover.Portal>
          <EditableOverlayPopover.Content
            align="start"
            className="sc-assessment-summary-feedback-popover"
            description="Shown to learners after they answer."
            icon={<Info size={iconSm} weight="fill" />}
            side="bottom"
            title="Feedback"
            tone="feedback"
            editor={{
              ariaLabel: "Summary feedback",
              bubbleMenuPluginKey: richTextPluginKey,
              className: "sc-assessment-summary-feedback__editor",
              extensions,
              fieldKey,
              mountClassName: "sc-assessment-summary-feedback-popover__editor",
              outerEditor: props.editor,
              placeholder: "Summary feedback",
              syncKey: authorFeedback?.document,
              target,
            }}
          />
        </EditableOverlayPopover.Portal>
      </EditableOverlayPopover.Root>
    </NodeViewWrapper>
  );
}

function renderSummaryFeedbackActionTrigger({ hasFeedback }: { hasFeedback: boolean }) {
  return (
    <button
      type="button"
      aria-label="Show feedback"
      className={cn(
        "sc-button",
        "sc-assessment-summary-feedback-trigger",
        hasFeedback && "sc-assessment-summary-feedback-trigger--has-feedback",
      )}
      data-size="md"
      data-variant="secondary"
      data-no-select
    >
      <Info
        size={iconSm}
        weight={hasFeedback ? "fill" : "regular"}
        aria-hidden
        className="sc-assessment-summary-feedback-trigger__icon"
      />
      <span className="sc-assessment-summary-feedback-trigger__text">Show feedback</span>
    </button>
  );
}

function readStringAttr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readSummaryFeedbackFromParent(
  editor: NodeViewProps["editor"],
  pos: number,
): AssessmentFeedbackContent | null {
  const parent = resolveAssessmentAttrParent(editor, pos);
  if (!parent) return null;
  return readAssessmentFeedbackContent(parent.node.attrs["assessment"]?.summaryFeedback);
}

function setSummaryFeedbackOnParent(
  editor: NodeViewProps["editor"],
  pos: number,
  document: unknown,
) {
  const parent = resolveAssessmentAttrParent(editor, pos);
  if (!parent) return;
  const current =
    parent.node.attrs["assessment"] &&
    typeof parent.node.attrs["assessment"] === "object" &&
    !Array.isArray(parent.node.attrs["assessment"])
      ? parent.node.attrs["assessment"]
      : {};
  setAssessmentAttr(editor, parent, {
    ...current,
    summaryFeedback: richTextDocumentToAssessmentFeedback(document),
  });
}
