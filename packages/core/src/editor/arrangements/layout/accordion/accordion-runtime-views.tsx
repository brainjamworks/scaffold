import { NodeViewContent } from "@tiptap/react";
import { useEffect, useRef } from "react";

import {
  getLayoutInteractionStoreState,
  useLayoutInteractionStore,
} from "../shared/model/layout-interaction-store";
import { useLayoutSemanticActivationBinding } from "../shared/model/use-layout-semantic-activation-binding";
import {
  useLearningEventReporter,
  type LearningEventReporter,
} from "@/runtime/learning-events/LearningEventRuntimeProvider";
import {
  resolveOwningRuntimeSurfaceId,
  useRuntimePresentedSurfaceId,
} from "@/runtime/renderer/runtime-surface-presentation";
import type {
  LayoutRuntimeViewProps,
  SectionRuntimeFrameOptions,
  SectionRuntimeViewProps,
} from "../runtime/layout-view-definition";
import {
  AccordionLayoutShell,
  AccordionSectionFrame,
  accordionOpenSectionIds,
  defaultOpenAccordionSectionIds,
  isAccordionSectionOpen,
  readAccordionOptions,
  readAccordionSections,
  readRequiredAccordionNodeId,
  accordionPanelId,
} from "./accordion-components";
import { useAccordionControlBinding } from "./accordion-control-binding";

import "./accordion.css";

export function AccordionLayoutRuntimeView(props: LayoutRuntimeViewProps) {
  const layoutId = readRequiredAccordionNodeId(props.node.attrs["id"], "layout");
  const options = readAccordionOptions(props.node.attrs["options"]);
  const sections = readAccordionSections(props.node);
  const defaultOpenIds = defaultOpenAccordionSectionIds(sections);
  const storedOpenIds = useLayoutInteractionStore(
    props.editor,
    (state) => state.openAccordionSectionsByLayoutId[layoutId],
  );
  const setAccordionSectionOpen = useLayoutInteractionStore(
    props.editor,
    (state) => state.setAccordionSectionOpen,
  );
  const openSectionIds = accordionOpenSectionIds({ defaultOpenIds, storedOpenIds });
  const pendingProgrammaticOpenIds = useLayoutInteractionStore(
    props.editor,
    (state) => state.pendingProgrammaticAccordionOpenIdsByLayoutId[layoutId],
  );
  const consumePendingProgrammaticOpenIds = useLayoutInteractionStore(
    props.editor,
    (state) => state.consumePendingProgrammaticAccordionOpenIds,
  );
  const learningEventReporter = useLearningEventReporter();
  const presentedSurfaceId = useRuntimePresentedSurfaceId();
  const owningSurfaceId = resolveOwningRuntimeSurfaceId(props.editor.state.doc, props.getPos);
  const isPresented =
    presentedSurfaceId === undefined ||
    (presentedSurfaceId !== null && owningSurfaceId === presentedSurfaceId);
  const recordedOpenRef = useRef<{
    reporter: LearningEventReporter;
    sectionIds: ReadonlySet<string>;
  } | null>(null);

  useAccordionControlBinding({
    editor: props.editor,
    getPos: props.getPos,
    layoutId,
    node: props.node,
  });

  useLayoutSemanticActivationBinding({
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
        origin: "semantic-activation",
      }),
    visibilityElementId: (childId) => accordionPanelId(layoutId, childId),
  });

  useEffect(() => {
    if (!isPresented) {
      recordedOpenRef.current = null;
      return;
    }

    const previous =
      recordedOpenRef.current?.reporter === learningEventReporter
        ? recordedOpenRef.current.sectionIds
        : new Set<string>();
    const programmaticOpenIds = new Set(pendingProgrammaticOpenIds ?? []);

    for (const sectionId of openSectionIds) {
      if (previous.has(sectionId)) continue;
      if (programmaticOpenIds.has(sectionId)) continue;
      const sectionIndex = sections.findIndex((section) => section.id === sectionId);
      if (sectionIndex < 0) continue;

      try {
        learningEventReporter.report({
          type: "layout-section.experienced",
          layoutId,
          sectionId,
          layoutKind: "accordion",
          position: sectionIndex + 1,
          count: sections.length,
        });
      } catch {
        // Layout recording is observational and cannot make content unavailable.
      }
    }

    recordedOpenRef.current = {
      reporter: learningEventReporter,
      sectionIds: new Set(openSectionIds),
    };
    if (pendingProgrammaticOpenIds?.length) consumePendingProgrammaticOpenIds(layoutId);
  }, [
    consumePendingProgrammaticOpenIds,
    isPresented,
    layoutId,
    learningEventReporter,
    openSectionIds,
    pendingProgrammaticOpenIds,
    sections,
  ]);

  return (
    <div className="sc-course-accordion">
      <AccordionLayoutShell options={options}>
        <NodeViewContent className="sc-course-accordion__content" />
      </AccordionLayoutShell>
    </div>
  );
}

export function AccordionSectionRuntimeView(_props: SectionRuntimeViewProps) {
  return (
    <AccordionSectionFrame>
      <NodeViewContent className="sc-course-accordion__section-content" />
    </AccordionSectionFrame>
  );
}

export function accordionRuntimeSectionFrame(
  _props: SectionRuntimeViewProps,
): SectionRuntimeFrameOptions {
  return {
    className: "sc-course-accordion__section",
  };
}
