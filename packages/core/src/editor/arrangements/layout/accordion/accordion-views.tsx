import { NodeViewContent } from "@tiptap/react";
import { useCallback, useMemo } from "react";

import {
  courseLayoutChromePresentation,
  LayoutAddGhost,
  resolveSectionPresentationElement,
  SectionActionTrigger,
  SectionMovementHandle,
} from "../authoring/layout-chrome";
import {
  getLayoutInteractionStoreState,
  useLayoutInteractionStore,
} from "../shared/model/layout-interaction-store";
import { useLayoutSemanticContainerAdapter } from "../shared/model/use-layout-semantic-container-adapter";
import type {
  LayoutComponentProps,
  SectionComponentProps,
  SectionFrameProps,
} from "../authoring/layout-view-definition";
import {
  AccordionLayoutShell,
  AccordionSectionFrame,
  accordionPanelId,
  defaultOpenAccordionSectionIds,
  isAccordionSectionOpen,
  readAccordionOptions,
  readAccordionSections,
  readRequiredAccordionNodeId,
} from "./accordion-components";
import {
  createAccordionAuthoringReorderProjection,
  resolveAccordionAuthoringSectionElement,
} from "./accordion-authoring-reorder-projection";

import "./accordion.css";

export function AccordionLayoutView(props: LayoutComponentProps) {
  const layoutId = readRequiredAccordionNodeId(props.node.attrs["id"], "layout");
  const options = readAccordionOptions(props.node.attrs["options"]);
  const sections = readAccordionSections(props.node);
  const addLabel = props.definition?.section?.addLabel ?? "Add section";
  const defaultOpenIds = defaultOpenAccordionSectionIds(sections);
  const setAccordionSectionOpen = useLayoutInteractionStore(
    props.editor,
    (state) => state.setAccordionSectionOpen,
  );

  useLayoutSemanticContainerAdapter({
    editor: props.editor,
    getPos: props.getPos,
    layoutId,
    node: props.node,
    isVisible: (childId) =>
      isAccordionSectionOpen({
        defaultOpenIds: defaultOpenAccordionSectionIds(readAccordionSections(props.node)),
        sectionId: childId,
        storedOpenIds: getLayoutInteractionStoreState(props.editor).openAccordionSectionsByLayoutId[
          layoutId
        ],
      }),
    revealChild: (childId) =>
      setAccordionSectionOpen(layoutId, childId, {
        allowMultiple: options.allowMultiple,
        defaultOpenIds: defaultOpenAccordionSectionIds(readAccordionSections(props.node)),
      }),
    visibilityElementId: (childId) => accordionPanelId(layoutId, childId),
  });

  return (
    <div className="sc-course-accordion sc-course-accordion--authoring">
      <AccordionLayoutShell
        options={options}
        footer={
          props.editable && props.definition?.section ? (
            <LayoutAddGhost
              chromePresentation={courseLayoutChromePresentation}
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
              className="sc-course-accordion__add"
            />
          ) : null
        }
      >
        <NodeViewContent className="sc-course-accordion__content" />
      </AccordionLayoutShell>
    </div>
  );
}

export function AccordionSectionView(props: SectionComponentProps) {
  const sectionId = resolveSectionId(props);
  const state = resolveAccordionSectionState(props);
  const getPresentationElement = useCallback(
    () =>
      resolveAccordionAuthoringSectionElement(
        resolveSectionPresentationElement({
          editor: props.editor,
          getPos: props.getPos,
        }),
      ),
    [props.editor, props.getPos],
  );
  const reorderProjection = useMemo(
    () => createAccordionAuthoringReorderProjection(getPresentationElement),
    [getPresentationElement],
  );

  return (
    <AccordionSectionFrame
      state={state}
      before={
        props.editable ? (
          <SectionMovementHandle
            editor={props.editor}
            getPresentationElement={getPresentationElement}
            getPos={props.getPos}
            projection={reorderProjection}
            sectionId={sectionId}
            className="sc-course-accordion__handle"
          />
        ) : null
      }
      after={
        props.editable ? (
          <SectionActionTrigger
            blockDefinitions={props.blockDefinitions}
            chromePresentation={courseLayoutChromePresentation}
            editor={props.editor}
            getPos={props.getPos}
            sectionId={sectionId}
            className="sc-course-accordion__action"
          />
        ) : null
      }
    >
      <NodeViewContent className="sc-course-accordion__section-content" />
    </AccordionSectionFrame>
  );
}

export function accordionSectionFrame(_props: SectionComponentProps): SectionFrameProps {
  return {
    className: "sc-course-accordion__section",
  };
}

function resolveAccordionSectionState(props: SectionComponentProps): "open" | "closed" {
  const sections = props.layoutNode ? readAccordionSections(props.layoutNode) : [];
  const sectionId = resolveSectionId(props);
  const layoutId = resolveSectionLayoutId(props);
  const defaultOpenIds = defaultOpenAccordionSectionIds(sections);
  const storedOpenIds = useLayoutInteractionStore(
    props.editor,
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
