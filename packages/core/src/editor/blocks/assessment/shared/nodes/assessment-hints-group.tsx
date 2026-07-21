import { Node, mergeAttributes } from "@tiptap/core";
import {
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  LightbulbIcon as Lightbulb,
  PlusIcon as Plus,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { useId, useMemo, useRef } from "react";

import { Hints } from "@/editor/blocks/assessment/shared/chrome/Hints";
import { EditorFloatingPopover } from "@/editor/interactions/floating/EditorFloatingPopover";

import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import type { NestedRichTextContentTarget } from "@/editor/prosemirror/nested-rich-text-editor";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { currentNodeViewPos, safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import { EditableOverlayPopover } from "@/editor/rich-text/authoring/nested-overlay/EditableOverlayPopoverShell";
import { iconSm, iconXs } from "@/ui/tokens/icon-sizes";

/**
 * Container for an assessment block's assessment_hint children. Thin
 * Tiptap bridge that mounts the authoring Hints atom and exposes Add-hint
 * insertion. Runtime uses `AssessmentHintsGroupRuntimeNode`.
 */
export const AssessmentHintsGroupNode = Node.create({
  name: "assessment_hints_group",
  content: "assessment_hint*",
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="assessment-hints-group"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "assessment-hints-group",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssessmentHintsGroupNodeView);
  },
});

function AssessmentHintsGroupNodeView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const popoverId = useId();
  const richTextPluginKey = useMemo(
    () => `assessment-hints-rich-text-${popoverId.replace(/[^A-Za-z0-9_-]/g, "")}`,
    [popoverId],
  );
  const extensions = useMemo(
    () => [
      ...createFieldContentEditorExtensions(),
      Placeholder.configure({
        placeholder: "Write a hint",
      }),
    ],
    [],
  );
  const activeHintIndex = useRef(0);
  const contentTarget = useRef<NestedRichTextContentTarget | null>(null);

  const addHint = () => {
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "assessment_hints_group");
    if (currentPos === null) return;
    const currentNode = props.editor.state.doc.nodeAt(currentPos);
    if (!currentNode || currentNode.type.name !== "assessment_hints_group") return;
    const insertAt = currentPos + currentNode.nodeSize - 1;
    props.editor
      .chain()
      .insertContentAt(insertAt, {
        type: "assessment_hint",
        content: [{ type: "paragraph" }],
      })
      .run();
  };

  const deleteHint = (index: number) => {
    const target = resolveHintAtIndex(props.editor, props.getPos, index);
    if (!target) return;

    props.editor
      .chain()
      .deleteRange({
        from: target.pos,
        to: target.pos + target.node.nodeSize,
      })
      .run();
  };

  if (!isEditable) {
    return (
      <NodeViewWrapper
        data-slot="assessment-hints-group"
        className="sc-assessment-field--hidden"
        contentEditable={false}
      />
    );
  }

  return (
    <NodeViewWrapper data-slot="assessment-hints-group" contentEditable={false}>
      <Hints
        hintsTotal={props.node.childCount}
        isEditable
        hintsShown={0}
        submitted={false}
        onReveal={() => undefined}
        onAddHint={addHint}
        onDeleteHint={deleteHint}
        popover={EditorFloatingPopover}
        renderAuthorPopover={({
          activeIndex,
          hasVisibleHints,
          onAddHint,
          onDeleteHint,
          onNext,
          onPrevious,
          total,
        }) => {
          activeHintIndex.current = activeIndex;
          const visibleHintNumber = activeIndex + 1;
          const title = hasVisibleHints ? `Hint ${visibleHintNumber}` : "Hints";
          const resolvedTarget = resolveHintAtIndex(props.editor, props.getPos, activeIndex);
          if (resolvedTarget && !contentTarget.current) {
            contentTarget.current = {
              kind: "content",
              node: resolvedTarget.node,
              getPos: () =>
                resolveHintAtIndex(props.editor, props.getPos, activeHintIndex.current)?.pos ??
                safeGetPos(props.getPos),
            };
          } else if (resolvedTarget && contentTarget.current) {
            contentTarget.current.node = resolvedTarget.node;
          }
          const target = resolvedTarget ? contentTarget.current : null;

          return (
            <EditableOverlayPopover.Portal>
              <EditableOverlayPopover.Content
                aria-label={title}
                align="start"
                className="sc-assessment-hint-authoring-popover"
                icon={<Lightbulb size={iconSm} weight="fill" />}
                meta={total > 1 ? `${visibleHintNumber} / ${total}` : undefined}
                side="top"
                sideOffset={8}
                title={title}
                tone="hint"
                editor={{
                  ariaLabel: `Hint ${visibleHintNumber} editor`,
                  bubbleMenuPluginKey: richTextPluginKey,
                  className: "sc-assessment-hint-popover__editor",
                  extensions,
                  mountClassName: "sc-assessment-hint-popover__editor-shell",
                  outerEditor: props.editor,
                  placeholder: "Write a hint",
                  syncKey: resolvedTarget?.node,
                  target,
                }}
                headerActions={
                  total > 1 ? (
                    <EditableOverlayPopover.Pager aria-label="Hint navigation">
                      <button
                        type="button"
                        onClick={onPrevious}
                        disabled={activeIndex === 0}
                        aria-label="Previous hint"
                      >
                        <CaretLeft size={iconXs} weight="bold" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={onNext}
                        disabled={activeIndex >= total - 1}
                        aria-label="Next hint"
                      >
                        <CaretRight size={iconXs} weight="bold" aria-hidden />
                      </button>
                    </EditableOverlayPopover.Pager>
                  ) : undefined
                }
                footerStart={
                  hasVisibleHints ? (
                    <EditableOverlayPopover.TextAction
                      aria-label={`Delete hint ${visibleHintNumber}`}
                      tone="danger"
                      onClick={onDeleteHint}
                    >
                      <Trash size={iconXs} aria-hidden />
                      <span>Delete hint</span>
                    </EditableOverlayPopover.TextAction>
                  ) : undefined
                }
                footerEnd={
                  hasVisibleHints ? (
                    <EditableOverlayPopover.TextAction
                      className="sc-assessment-hint-popover__add"
                      data-action="add-hint"
                      onClick={onAddHint}
                    >
                      <Plus size={iconXs} weight="bold" aria-hidden />
                      <span>Add hint</span>
                    </EditableOverlayPopover.TextAction>
                  ) : undefined
                }
              />
            </EditableOverlayPopover.Portal>
          );
        }}
      >
        {null}
      </Hints>
    </NodeViewWrapper>
  );
}

interface ResolvedHintTarget {
  node: ProseMirrorNode;
  pos: number;
}

function resolveHintAtIndex(
  editor: NodeViewProps["editor"],
  getPos: NodeViewProps["getPos"],
  index: number,
): ResolvedHintTarget | null {
  const groupPos = safeGetPos(getPos);
  if (!isValidEditorDocPos(editor, groupPos)) return null;

  const groupNode = editor.state.doc.nodeAt(groupPos);
  if (!groupNode || groupNode.type.name !== "assessment_hints_group") {
    return null;
  }

  let childPos = groupPos + 1;
  for (let childIndex = 0; childIndex < groupNode.childCount; childIndex += 1) {
    const child = groupNode.child(childIndex);
    if (child.type.name === "assessment_hint") {
      if (childIndex === index) {
        return { node: child, pos: childPos };
      }
    }
    childPos += child.nodeSize;
  }

  return null;
}
