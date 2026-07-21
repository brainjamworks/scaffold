import { NodeViewContent } from "@tiptap/react";

import {
  LayoutAddGhost,
  SectionActionTrigger,
  SectionMovementHandle,
} from "../authoring/layout-chrome";
import { useLayoutInteractionStore } from "../shared/model/layout-interaction-store";
import type {
  LayoutComponentProps,
  SectionComponentProps,
  SectionFrameProps,
} from "../authoring/layout-view-definition";
import {
  AccordionLayoutShell,
  AccordionSectionFrame,
  defaultOpenAccordionSectionIds,
  isAccordionSectionOpen,
  readAccordionOptions,
  readAccordionSections,
  readRequiredAccordionNodeId,
} from "./accordion-components";

import "./accordion.css";

export function AccordionLayoutView(props: LayoutComponentProps) {
  const layoutId = readRequiredAccordionNodeId(props.node.attrs["id"], "layout");
  const options = readAccordionOptions(props.node.attrs["options"]);
  const addLabel = props.definition?.section?.addLabel ?? "Add section";
  const defaultOpenIds = defaultOpenAccordionSectionIds(readAccordionSections(props.node));
  const setAccordionSectionOpen = useLayoutInteractionStore(
    (state) => state.setAccordionSectionOpen,
  );

  return (
    <div className="sc-accordion-layout sc-accordion-layout--authoring">
      <AccordionLayoutShell
        options={options}
        footer={
          props.editable && props.definition?.section ? (
            <LayoutAddGhost
              editor={props.editor}
              getPos={props.getPos}
              label={addLabel}
              layoutId={layoutId}
              onSectionAdded={({ sectionId }) => {
                if (!sectionId) return;
                setAccordionSectionOpen(layoutId, sectionId, {
                  allowMultiple: options.allowMultiple,
                  defaultOpenIds,
                });
              }}
              presentation="full-width"
              className="sc-accordion-layout__add"
            />
          ) : null
        }
      >
        <NodeViewContent className="sc-accordion-layout__content" />
      </AccordionLayoutShell>
    </div>
  );
}

export function AccordionSectionView(props: SectionComponentProps) {
  const sectionId = resolveSectionId(props);
  const state = resolveAccordionSectionState(props);

  return (
    <AccordionSectionFrame
      state={state}
      before={
        props.editable ? (
          <SectionMovementHandle
            editor={props.editor}
            getPos={props.getPos}
            sectionId={sectionId}
            className="sc-accordion-section__handle"
          />
        ) : null
      }
      after={
        props.editable ? (
          <SectionActionTrigger
            blockDefinitions={props.blockDefinitions}
            editor={props.editor}
            getPos={props.getPos}
            sectionId={sectionId}
            className="sc-accordion-section__action"
          />
        ) : null
      }
    >
      <NodeViewContent className="sc-accordion-section__content" />
    </AccordionSectionFrame>
  );
}

export function accordionSectionFrame(_props: SectionComponentProps): SectionFrameProps {
  return {
    className: "sc-accordion-section",
  };
}

function resolveAccordionSectionState(props: SectionComponentProps): "open" | "closed" {
  const sections = props.layoutNode ? readAccordionSections(props.layoutNode) : [];
  const sectionId = resolveSectionId(props);
  const layoutId = resolveSectionLayoutId(props);
  const defaultOpenIds = defaultOpenAccordionSectionIds(sections);
  const storedOpenIds = useLayoutInteractionStore(
    (state) => state.openAccordionSectionsByLayoutId[layoutId],
  );
  const isOpen = isAccordionSectionOpen({
    defaultOpenIds,
    sectionId,
    storedOpenIds,
  });

  return isOpen ? "open" : "closed";
}

function resolveSectionLayoutId(props: SectionComponentProps): string {
  return readRequiredAccordionNodeId(props.layoutNode?.attrs["id"], "layout");
}

function resolveSectionId(props: SectionComponentProps): string {
  return readRequiredAccordionNodeId(props.node.attrs["id"], "section");
}
