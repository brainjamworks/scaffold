import { NodeViewContent } from "@tiptap/react";
import { useEffect, useRef } from "react";

import { useLayoutInteractionStore } from "../shared/model/layout-interaction-store";
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
  readAccordionOptions,
  readAccordionSections,
  readRequiredAccordionNodeId,
} from "./accordion-components";

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
  const openSectionIds = accordionOpenSectionIds({ defaultOpenIds, storedOpenIds });
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

  useEffect(() => {
    if (!isPresented) {
      recordedOpenRef.current = null;
      return;
    }

    const previous =
      recordedOpenRef.current?.reporter === learningEventReporter
        ? recordedOpenRef.current.sectionIds
        : new Set<string>();

    for (const sectionId of openSectionIds) {
      if (previous.has(sectionId)) continue;
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
  }, [isPresented, layoutId, learningEventReporter, openSectionIds, sections]);

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
