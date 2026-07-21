import { CaretDownIcon as CaretDown } from "@phosphor-icons/react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import type { KeyboardEvent, MouseEvent } from "react";

import {
  SECTION_ARRANGEMENT_CONTENT,
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";
import "@/editor/bounded-containers/view/bounded-container.css";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { iconSm } from "@/ui/tokens/icon-sizes";

import { useLayoutInteractionStore } from "../shared/model/layout-interaction-store";
import {
  accordionPanelId,
  accordionTriggerId,
  defaultOpenAccordionSectionIds,
  focusAccordionTrigger,
  isAccordionSectionOpen,
  nextAccordionSectionForKey,
  readAccordionOptions,
  readAccordionSections,
  readRequiredAccordionNodeId,
  type AccordionSectionSummary,
} from "./accordion-components";

import "./accordion.css";

const ACCORDION_SECTION_TITLE_CONTENT = textContentExpression();
const ACCORDION_SECTION_PANEL_CONTENT = `(block | ${SECTION_ARRANGEMENT_CONTENT})+`;

export const AccordionSectionTitleNode = Node.create({
  name: "accordion_section_title",
  group: "block",
  ...fieldContainerSpec({ content: ACCORDION_SECTION_TITLE_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="accordion-section-title"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "accordion-section-title",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AccordionSectionTitleView);
  },
});

export const AccordionSectionPanelNode = Node.create({
  name: "accordion_section_panel",
  group: "block",
  content: ACCORDION_SECTION_PANEL_CONTENT,
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="accordion-section-panel"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "accordion-section-panel",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AccordionSectionPanelView);
  },
});

function AccordionSectionTitleView(props: NodeViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const context = useAccordionSectionContext(props);
  const title = props.node.textContent.trim() || "section";
  const state = context?.isOpen ? "open" : "closed";

  const toggle = () => {
    if (!context) return;
    context.toggleAccordionSection(context.layoutId, context.sectionId, {
      allowMultiple: context.allowMultiple,
      defaultOpenIds: context.defaultOpenIds,
    });
  };

  const handleRowClick = (event: MouseEvent<HTMLDivElement>) => {
    if (editable) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    toggle();
  };

  return (
    <NodeViewWrapper
      data-slot="accordion-section-title"
      data-state={state}
      className="sc-accordion-title"
    >
      <div className="sc-accordion-title__row-shell">
        <div
          data-state={state}
          data-editable={editable ? "true" : undefined}
          onClick={handleRowClick}
          className="sc-accordion-title__row"
        >
          <NodeViewContent className="sc-accordion-title__content" />
          <button
            type="button"
            id={context?.triggerId}
            aria-label={`${context?.isOpen ? "Collapse" : "Expand"} ${title}`}
            aria-expanded={context?.isOpen ?? false}
            aria-controls={context?.panelId}
            contentEditable={false}
            data-scaffold-accordion-trigger=""
            data-state={state}
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggle}
            onKeyDown={(event) => {
              if (!context) return;
              handleAccordionKeyDown({
                event,
                layoutId: context.layoutId,
                sectionId: context.sectionId,
                sections: context.sections,
              });
            }}
            className="sc-accordion-title__trigger"
          >
            <CaretDown
              size={iconSm}
              weight="bold"
              aria-hidden
              className="sc-accordion-title__icon"
            />
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

function AccordionSectionPanelView(props: NodeViewProps) {
  const context = useAccordionSectionContext(props);
  const state = context?.isOpen ? "open" : "closed";

  return (
    <NodeViewWrapper
      data-slot="accordion-section-panel"
      id={context?.panelId}
      role="region"
      aria-labelledby={context?.triggerId}
      hidden={context ? !context.isOpen : false}
      data-scaffold-accordion-panel=""
      data-state={state}
      className="sc-accordion-panel"
    >
      <NodeViewContent
        data-bounded-viewport="scroll"
        className="sc-layout-section__content sc-accordion-panel__content"
      />
    </NodeViewWrapper>
  );
}

interface AccordionSectionContext {
  layoutId: string;
  sectionId: string;
  allowMultiple: boolean;
  defaultOpenIds: readonly string[];
  sections: readonly AccordionSectionSummary[];
  isOpen: boolean;
  triggerId: string;
  panelId: string;
  toggleAccordionSection: ReturnType<
    typeof useLayoutInteractionStore.getState
  >["toggleAccordionSection"];
}

function useAccordionSectionContext(props: NodeViewProps): AccordionSectionContext | null {
  const base = resolveAccordionSectionContext(props);
  const storedOpenIds = useLayoutInteractionStore((state) =>
    base ? state.openAccordionSectionsByLayoutId[base.layoutId] : undefined,
  );
  const toggleAccordionSection = useLayoutInteractionStore((state) => state.toggleAccordionSection);

  if (!base) return null;

  const defaultOpenIds = defaultOpenAccordionSectionIds(base.sections);

  return {
    ...base,
    defaultOpenIds,
    isOpen: isAccordionSectionOpen({
      defaultOpenIds,
      sectionId: base.sectionId,
      storedOpenIds,
    }),
    triggerId: accordionTriggerId(base.layoutId, base.sectionId),
    panelId: accordionPanelId(base.layoutId, base.sectionId),
    toggleAccordionSection,
  };
}

function resolveAccordionSectionContext(props: NodeViewProps): {
  layoutId: string;
  sectionId: string;
  allowMultiple: boolean;
  sections: readonly AccordionSectionSummary[];
} | null {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) return null;
    const resolved = props.editor.state.doc.resolve(pos);
    let section = null as ReturnType<typeof resolved.node> | null;
    let layout = null as ReturnType<typeof resolved.node> | null;

    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const node = resolved.node(depth);
      if (!section && node.type.name === "section") section = node;
      if (node.type.name === "layout") {
        layout = node;
        break;
      }
    }

    if (!section || !layout) return null;

    return {
      layoutId: readRequiredAccordionNodeId(layout.attrs["id"], "layout"),
      sectionId: readRequiredAccordionNodeId(section.attrs["id"], "section"),
      allowMultiple: readAccordionOptions(layout.attrs["options"]).allowMultiple,
      sections: readAccordionSections(layout),
    };
  } catch {
    return null;
  }
}

function handleAccordionKeyDown({
  event,
  layoutId,
  sectionId,
  sections,
}: {
  event: KeyboardEvent<HTMLButtonElement>;
  layoutId: string;
  sectionId: string;
  sections: readonly AccordionSectionSummary[];
}) {
  const next = nextAccordionSectionForKey({
    key: event.key,
    sectionId,
    sections,
  });
  if (!next) return;
  event.preventDefault();
  focusAccordionTrigger(layoutId, next.id);
}
