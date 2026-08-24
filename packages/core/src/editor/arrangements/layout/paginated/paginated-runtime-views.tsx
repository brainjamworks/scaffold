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
  PaginatedLayoutShell,
  normalizeActivePageId,
  paginatedPagePanelId,
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
  const lastSectionChange = useLayoutInteractionStore(
    props.editor,
    (state) => state.lastSectionChangeByLayoutId[layoutId],
  );
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

  useLayoutSemanticActivationBinding({
    editor: props.editor,
    getPos: props.getPos,
    layoutId,
    node: props.node,
    isVisible: (childId) => {
      const storedActiveId = getLayoutInteractionStoreState(props.editor).activePageByLayoutId[
        layoutId
      ];
      return normalizeActivePageId(storedActiveId, readPaginatedPages(props.node)) === childId;
    },
    revealChild: (childId) => setActivePage(layoutId, childId, { origin: "semantic-activation" }),
    visibilityElementId: (childId) => paginatedPagePanelId(layoutId, childId),
  });

  useEffect(() => {
    if (!isPresented) {
      recordedSectionRef.current = null;
      return;
    }
    if (!activeId || activeIndex < 0) return;
    if (
      lastSectionChange?.origin === "semantic-activation" &&
      lastSectionChange.sectionId === activeId
    ) {
      recordedSectionRef.current = { reporter: learningEventReporter, sectionId: activeId };
      return;
    }
    const previous = recordedSectionRef.current;
    if (previous?.reporter === learningEventReporter && previous.sectionId === activeId) {
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
  }, [
    activeId,
    activeIndex,
    isPresented,
    lastSectionChange,
    layoutId,
    learningEventReporter,
    pages.length,
  ]);

  return (
    <div className="sc-course-paginated">
      <PaginatedLayoutShell
        activeId={activeId}
        layoutId={layoutId}
        onActivate={(pageId) => setActivePage(layoutId, pageId)}
        pages={pages}
      >
        <NodeViewContent className="sc-course-paginated__content" />
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
      className="sc-course-paginated__panel"
    >
      <div data-bounded-scroll-frame="">
        <props.ContentRoot
          data-bounded-scroll=""
          className="sc-layout-section__content sc-course-paginated__page-content"
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
    className: "sc-course-paginated__section",
  };
}
