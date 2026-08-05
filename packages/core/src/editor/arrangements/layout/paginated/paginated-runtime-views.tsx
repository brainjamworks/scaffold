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
  PaginatedLayoutShell,
  normalizeActivePageId,
  paginatedPanelAttributes,
  readPaginatedPages,
  readRequiredPaginatedNodeId,
} from "./paginated-components";

import "@/editor/bounded-containers/view/bounded-container.css";
import { BoundedScrollHint } from "@/editor/bounded-containers/view/bounded-scroll";
import "./paginated.css";

export function PaginatedLayoutRuntimeView(props: LayoutRuntimeViewProps) {
  const layoutId = readRequiredPaginatedNodeId(props.node.attrs["id"], "layout");
  const pages = readPaginatedPages(props.node);
  const storedActiveId = useLayoutInteractionStore(
    props.editor,
    (state) => state.activePageByLayoutId[layoutId],
  );
  const setActivePage = useLayoutInteractionStore(props.editor, (state) => state.setActivePage);
  const activeId = normalizeActivePageId(storedActiveId, pages);
  const learningEventReporter = useLearningEventReporter();
  const presentedSurfaceId = useRuntimePresentedSurfaceId();
  const owningSurfaceId = resolveOwningRuntimeSurfaceId(props.editor.state.doc, props.getPos);
  const isPresented =
    presentedSurfaceId === undefined ||
    (presentedSurfaceId !== null && owningSurfaceId === presentedSurfaceId);
  const recordedSectionRef = useRef<{
    reporter: LearningEventReporter;
    sectionId: string;
  } | null>(null);
  const activeIndex = pages.findIndex((page) => page.id === activeId);

  useEffect(() => {
    if (!isPresented) {
      recordedSectionRef.current = null;
      return;
    }
    if (!activeId || activeIndex < 0) return;
    const previous = recordedSectionRef.current;
    if (
      previous?.reporter === learningEventReporter &&
      previous.sectionId === activeId
    ) {
      return;
    }

    try {
      learningEventReporter.report({
        type: "layout-section.experienced",
        layoutId,
        sectionId: activeId,
        layoutKind: "paginated",
        position: activeIndex + 1,
        count: pages.length,
      });
      recordedSectionRef.current = { reporter: learningEventReporter, sectionId: activeId };
    } catch {
      // Layout recording is observational and cannot make content unavailable.
    }
  }, [activeId, activeIndex, isPresented, layoutId, learningEventReporter, pages.length]);

  return (
    <div className="sc-paginated-layout">
      <PaginatedLayoutShell
        activeId={activeId}
        layoutId={layoutId}
        onActivate={(pageId) => setActivePage(layoutId, pageId)}
        pages={pages}
      >
        <NodeViewContent className="sc-paginated-layout__content" />
      </PaginatedLayoutShell>
    </div>
  );
}

export function PaginatedSectionRuntimeView(props: SectionRuntimeViewProps) {
  const layoutId = readRequiredPaginatedNodeId(props.layoutNode?.attrs["id"], "layout");
  const pageId = readRequiredPaginatedNodeId(props.node.attrs["id"], "section");
  const pages = readPaginatedPages(props.layoutNode);
  const storedActiveId = useLayoutInteractionStore(
    props.editor,
    (state) => state.activePageByLayoutId[layoutId],
  );
  const activeId = normalizeActivePageId(storedActiveId, pages);
  const isActive = pageId === activeId;

  return (
    <div
      {...paginatedPanelAttributes({ layoutId, pageId, isActive })}
      className="sc-paginated-layout__panel"
    >
      <div data-bounded-scroll-frame="">
        <NodeViewContent
          data-bounded-scroll=""
          className="sc-layout-section__content sc-paginated-layout__page-content"
        />
        <BoundedScrollHint />
      </div>
    </div>
  );
}

export function paginatedRuntimeSectionFrame(
  _props: SectionRuntimeViewProps,
): SectionRuntimeFrameOptions {
  return {
    className: "sc-paginated-layout__section",
  };
}
