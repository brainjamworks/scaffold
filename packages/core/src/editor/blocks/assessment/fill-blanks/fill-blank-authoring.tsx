import {
  ArrowUUpLeftIcon as ArrowUUpLeft,
  BracketsCurlyIcon as BracketsCurly,
  PlusIcon as Plus,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import type { Extensions } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type Editor,
  type NodeViewProps,
} from "@tiptap/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Accordion } from "@/ui/components/Accordion/Accordion";
import { Button } from "@/ui/components/Button/Button";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { Field, Input, Label } from "@/ui/components/Input/Input";
import { Sheet } from "@/ui/components/Sheet/Sheet";
import { Switch } from "@/ui/components/Switch/Switch";
import {
  resolveAssessmentAttrParent,
  richTextDocumentToAssessmentFeedback,
  setAssessmentAttr,
} from "@/editor/blocks/assessment/shared/model/private-assessment-attrs";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import type { NestedRichTextEditorTarget } from "@/editor/prosemirror/nested-rich-text-editor";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import { RichTextArea } from "@/editor/rich-text/authoring/nested-overlay/RichTextArea";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { selectNodeAt } from "@/editor/selection/selection-commands";
import { setTextSelectionNearInTransaction } from "@/editor/selection/selection-transactions";
import { cn } from "@/lib/cn";
import {
  FillBlankPrivateAssessmentEntrySchema,
  FillBlanksPrivateAssessmentSchema,
  type FillBlankAttrs,
  type FillBlankPrivateAssessmentEntry,
} from "@scaffold/contracts";
import {
  EmptyScaffoldRichTextDocument,
  toTiptapRichTextDocument,
  type ScaffoldRichTextDocument,
} from "@/schemas/rich-text";
import { iconSm, iconXs } from "@/ui/tokens/icon-sizes";

import {
  answerCount,
  blankAttrsFromNode,
  compactAnswers,
  createFillBlankNode,
  defaultBlankAssessment,
  firstAnswer,
} from "./fill-blank-shared";
import "./FillBlanks.css";

export const FillBlankAuthoringNode = createFillBlankNode({
  addNodeView: () => ReactNodeViewRenderer(FillBlankAuthoringNodeView, { as: "span" }),
});

export const FillBlankNode = FillBlankAuthoringNode;

function FillBlankAuthoringNodeView(props: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const blank = useMemo(() => blankAttrsFromNode(props.node.attrs), [props.node.attrs]);
  const feedbackFieldId = useId();
  const feedbackBubbleMenuPluginKey = useMemo(
    () => `fill-blank-feedback-rich-text-${feedbackFieldId.replace(/[^A-Za-z0-9_-]/g, "")}`,
    [feedbackFieldId],
  );
  const feedbackEditorExtensions = useMemo(
    () => [
      ...createFieldContentEditorExtensions(),
      Placeholder.configure({
        includeChildren: false,
        placeholder: "Explain why this answer is right or wrong",
        showOnlyCurrent: false,
        showOnlyWhenEditable: true,
      }),
    ],
    [],
  );
  const latestTargetContext = useRef({ editor: props.editor, getPos: props.getPos });
  const currentBlankPos = (editor = props.editor) => {
    return resolveFillBlankPos(editor, props.getPos);
  };
  const blankAssessment = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentBlankPos(editor);
      return currentPos !== null
        ? readFillBlankAssessment(editor, currentPos, blank.id)
        : defaultBlankAssessment();
    },
  });
  const feedbackDocument =
    toTiptapRichTextDocument(blankAssessment.feedback?.document) ?? EmptyScaffoldRichTextDocument;
  const feedbackSyncKey = useMemo(
    () => ({ blankId: blank.id, document: feedbackDocument }),
    [blank.id, feedbackDocument],
  );

  useEffect(() => {
    latestTargetContext.current = { editor: props.editor, getPos: props.getPos };
  }, [props.editor, props.getPos]);

  const feedbackTarget = useMemo(
    () => ({
      kind: "attr" as const,
      read: () => {
        const latest = latestTargetContext.current;
        const currentPos = resolveFillBlankPos(latest.editor, latest.getPos);
        return currentPos !== null
          ? (toTiptapRichTextDocument(
              readFillBlankAssessment(latest.editor, currentPos, blank.id).feedback?.document,
            ) ?? EmptyScaffoldRichTextDocument)
          : EmptyScaffoldRichTextDocument;
      },
      write: (nextDocument: ScaffoldRichTextDocument) => {
        const latest = latestTargetContext.current;
        const currentPos = resolveFillBlankPos(latest.editor, latest.getPos);
        if (currentPos === null) return;
        updateBlankAssessment(latest.editor, currentPos, blank.id, {
          feedback: richTextDocumentToAssessmentFeedback(nextDocument),
        });
      },
    }),
    [blank.id],
  );

  return (
    <AuthorFillBlank
      blank={blank}
      blankAssessment={blankAssessment}
      editor={props.editor}
      feedbackBubbleMenuPluginKey={feedbackBubbleMenuPluginKey}
      feedbackEditorExtensions={feedbackEditorExtensions}
      feedbackSyncKey={feedbackSyncKey}
      feedbackTarget={feedbackTarget}
      getPos={currentBlankPos}
      open={open}
      selected={props.selected}
      setOpen={setOpen}
      updateAttributes={props.updateAttributes}
    />
  );
}

function AuthorFillBlank({
  blank,
  blankAssessment,
  editor,
  feedbackBubbleMenuPluginKey,
  feedbackEditorExtensions,
  feedbackSyncKey,
  feedbackTarget,
  getPos,
  open,
  selected,
  setOpen,
  updateAttributes,
}: {
  blank: FillBlankAttrs;
  blankAssessment: FillBlankPrivateAssessmentEntry;
  editor: Editor;
  feedbackBubbleMenuPluginKey: string;
  feedbackEditorExtensions: Extensions;
  feedbackSyncKey: unknown;
  feedbackTarget: NestedRichTextEditorTarget;
  getPos: () => number | null;
  open: boolean;
  selected: boolean;
  setOpen: (open: boolean) => void;
  updateAttributes: (attrs: Partial<FillBlankAttrs>) => void;
}) {
  const label = firstAnswer(blankAssessment) || blank.placeholder || "Blank";
  const count = answerCount(blankAssessment);
  const feedbackLabelId = useId();
  const sheetContentRef = useRef<HTMLDivElement | null>(null);
  const appendFeedbackBubbleMenuTo = useCallback(() => sheetContentRef.current, []);

  const updateAssessment = (patch: Partial<FillBlankPrivateAssessmentEntry>) => {
    updateBlankAssessment(editor, getPos(), blank.id, patch);
  };

  const updateAnswer = (index: number, value: string) => {
    updateAssessment({
      acceptedAnswers: blankAssessment.acceptedAnswers.map((answer, answerIndex) =>
        answerIndex === index ? value : answer,
      ),
    });
  };

  const addAnswer = () => {
    updateAssessment({
      acceptedAnswers: [...blankAssessment.acceptedAnswers, ""],
    });
  };

  const removeAnswer = (index: number) => {
    const next = blankAssessment.acceptedAnswers.filter((_, answerIndex) => answerIndex !== index);
    updateAssessment({
      acceptedAnswers: compactAnswers(next),
    });
  };

  const selectNode = () => {
    const pos = getPos();
    if (pos === null) return;
    selectNodeAt(editor, pos, { focus: true, scrollIntoView: false });
  };

  const restoreAsText = () => {
    const pos = getPos();
    if (pos === null) return;
    const currentNode = editor.state.doc.nodeAt(pos);
    if (!currentNode || currentNode.type.name !== "fill_blank") return;
    const replacement = firstAnswer(blankAssessment) || blank.placeholder;
    const tr = editor.state.tr;
    if (replacement) {
      tr.replaceWith(pos, pos + currentNode.nodeSize, editor.schema.text(replacement));
    } else {
      tr.delete(pos, pos + currentNode.nodeSize);
    }
    const nextPos = Math.min(pos + replacement.length, tr.doc.content.size);
    setTextSelectionNearInTransaction(tr, nextPos, 1);
    removeFillBlankAssessmentInTransaction(tr, editor, pos, blank.id);
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
  };

  return (
    <NodeViewWrapper
      as="span"
      data-node="fill-blank"
      data-blank-id={blank.id}
      contentEditable={false}
      className="sc-fill-blank sc-fill-blank--authoring"
    >
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          selectNode();
          setOpen(true);
        }}
        onClick={(event) => {
          event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          selectNode();
          setOpen(true);
        }}
        className={cn("sc-fill-blank__pill", selected && "sc-fill-blank__pill--selected")}
      >
        <BracketsCurly size={iconXs} weight="bold" aria-hidden />
        <span className="sc-fill-blank__label">{label}</span>
        {count > 1 && <span className="sc-fill-blank__count">+{count - 1}</span>}
      </button>

      <Sheet.Root open={open} onOpenChange={setOpen}>
        <Sheet.Content ref={sheetContentRef} side="right" contentEditable={false}>
          <Sheet.Header closeLabel="Close blank settings">
            <Sheet.Title>Edit blank</Sheet.Title>
            <Sheet.Description>
              Pick accepted answers, set matching rules, and add feedback for this fill-in.
            </Sheet.Description>
          </Sheet.Header>

          <Sheet.Body>
            <div className="sc-fill-blank-sheet__summary">
              <span className="sc-fill-blank-sheet__badge">
                <BracketsCurly size={iconXs} weight="bold" aria-hidden />
                <span className="sc-fill-blank-sheet__badge-label">{label}</span>
              </span>
              <span className="sc-fill-blank-sheet__answer-count">
                {count} accepted answer{count === 1 ? "" : "s"}
              </span>
            </div>

            <Accordion.Root
              type="multiple"
              defaultValue={["answer"]}
              className="sc-fill-blank-sheet__accordion"
            >
              <Accordion.Item value="answer">
                <Accordion.Header>Answer</Accordion.Header>
                <Accordion.Content>
                  <div className="sc-fill-blank-sheet__answer-section">
                    <Field>
                      <Label htmlFor={`${blank.id}-placeholder`}>Placeholder</Label>
                      <Input
                        id={`${blank.id}-placeholder`}
                        value={blank.placeholder}
                        onChange={(event) => updateAttributes({ placeholder: event.target.value })}
                        placeholder="Answer"
                      />
                    </Field>

                    <div className="sc-fill-blank-sheet__answers">
                      <Label>Accepted answers</Label>
                      {blankAssessment.acceptedAnswers.map((answer, index) => (
                        <div key={index} className="sc-fill-blank-sheet__answer-row">
                          <Input
                            value={answer}
                            onChange={(event) => updateAnswer(index, event.target.value)}
                            placeholder={index === 0 ? "Correct answer" : "Alternative answer"}
                          />
                          <IconButton
                            type="button"
                            variant="danger"
                            size="md"
                            aria-label={`Remove accepted answer ${index + 1}`}
                            disabled={blankAssessment.acceptedAnswers.length === 1}
                            onClick={() => removeAnswer(index)}
                          >
                            <Trash size={iconSm} aria-hidden />
                          </IconButton>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addAnswer}
                        className="sc-fill-blank-sheet__add-answer"
                      >
                        <Plus size={iconXs} weight="bold" aria-hidden />
                        <span>Add alternative</span>
                      </button>
                    </div>
                  </div>
                </Accordion.Content>
              </Accordion.Item>

              <Accordion.Item value="matching">
                <Accordion.Header>Matching</Accordion.Header>
                <Accordion.Content>
                  <div className="sc-fill-blank-sheet__matching-options">
                    <label className="sc-fill-blank-sheet__switch-row">
                      <span className="sc-fill-blank-sheet__switch-copy">
                        <span className="sc-fill-blank-sheet__switch-title">Case sensitive</span>
                        <span className="sc-fill-blank-sheet__switch-description">
                          When on, "Paris" and "paris" are different answers.
                        </span>
                      </span>
                      <Switch
                        checked={blankAssessment.caseSensitive}
                        onCheckedChange={(caseSensitive) => updateAssessment({ caseSensitive })}
                      />
                    </label>
                    <label className="sc-fill-blank-sheet__switch-row">
                      <span className="sc-fill-blank-sheet__switch-copy">
                        <span className="sc-fill-blank-sheet__switch-title">Trim spaces</span>
                        <span className="sc-fill-blank-sheet__switch-description">
                          Strip leading and trailing whitespace before comparing.
                        </span>
                      </span>
                      <Switch
                        checked={blankAssessment.trimWhitespace}
                        onCheckedChange={(trimWhitespace) => updateAssessment({ trimWhitespace })}
                      />
                    </label>
                  </div>
                </Accordion.Content>
              </Accordion.Item>

              <Accordion.Item value="feedback">
                <Accordion.Header>Feedback</Accordion.Header>
                <Accordion.Content>
                  <Field>
                    <Label id={feedbackLabelId}>Shown after submitting</Label>
                    <RichTextArea
                      ariaLabel="Shown after submitting"
                      ariaLabelledBy={feedbackLabelId}
                      autoFocus={false}
                      bubbleMenuAppendTo={appendFeedbackBubbleMenuTo}
                      bubbleMenuPluginKey={feedbackBubbleMenuPluginKey}
                      extensions={feedbackEditorExtensions}
                      outerEditor={editor}
                      placeholder="Explain why this answer is right or wrong"
                      fieldKey={`fill_blank:${blank.id}:feedback`}
                      syncKey={feedbackSyncKey}
                      target={feedbackTarget}
                    />
                  </Field>
                </Accordion.Content>
              </Accordion.Item>
            </Accordion.Root>
          </Sheet.Body>

          <Sheet.Footer className="sc-sheet-footer--split">
            <Button type="button" variant="ghost" size="sm" onClick={restoreAsText}>
              <ArrowUUpLeft size={iconXs} weight="bold" aria-hidden />
              Convert to text
            </Button>
            <Sheet.Close asChild>
              <Button type="button" variant="primary" size="md">
                Done
              </Button>
            </Sheet.Close>
          </Sheet.Footer>
        </Sheet.Content>
      </Sheet.Root>
    </NodeViewWrapper>
  );
}

function resolveFillBlankPos(editor: Editor, getPos: NodeViewProps["getPos"]): number | null {
  if (typeof getPos !== "function") return null;
  const currentPos = safeGetPos(getPos);
  if (!isValidEditorDocPos(editor, currentPos)) return null;
  const currentNode = editor.state.doc.nodeAt(currentPos);
  return currentNode?.type.name === "fill_blank" ? currentPos : null;
}

function readFillBlankAssessment(
  editor: Editor,
  pos: number,
  blankId: string,
): FillBlankPrivateAssessmentEntry {
  const parent = resolveAssessmentAttrParent(editor, pos, ["fill_blanks"]);
  if (!parent || !blankId) return defaultBlankAssessment();
  const assessment = FillBlanksPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  return assessment.blanksById[blankId] ?? defaultBlankAssessment();
}

function updateBlankAssessment(
  editor: Editor,
  pos: number | null,
  blankId: string,
  patch: Partial<FillBlankPrivateAssessmentEntry>,
) {
  if (pos === null || !blankId) return;
  const parent = resolveAssessmentAttrParent(editor, pos, ["fill_blanks"]);
  if (!parent) return;
  const assessment = FillBlanksPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  const current = assessment.blanksById[blankId] ?? defaultBlankAssessment();
  setAssessmentAttr(editor, parent, {
    ...assessment,
    blanksById: {
      ...assessment.blanksById,
      [blankId]: FillBlankPrivateAssessmentEntrySchema.parse({
        ...current,
        ...patch,
      }),
    },
  });
}

function removeFillBlankAssessmentInTransaction(
  tr: Editor["state"]["tr"],
  editor: Editor,
  pos: number,
  blankId: string,
) {
  const parent = resolveAssessmentAttrParent(editor, pos, ["fill_blanks"]);
  if (!parent || !blankId) return;
  const assessment = FillBlanksPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  const blanksById = { ...assessment.blanksById };
  delete blanksById[blankId];
  tr.setNodeMarkup(parent.pos, null, {
    ...parent.node.attrs,
    assessment: {
      ...assessment,
      blanksById,
    },
  });
}
