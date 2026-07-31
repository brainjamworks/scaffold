import { NodeViewContent } from "@tiptap/react";
import { useEffect, useRef } from "react";

import { useLayoutInteractionStore } from "../shared/model/layout-interaction-store";
import {
  buildLayoutSectionExperiencedStatementDraft,
  useXapiSession,
  type XapiSession,
} from "@/runtime/xapi";
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
  const xapiSession = useXapiSession();
  const presentedSurfaceId = useRuntimePresentedSurfaceId();
  const owningSurfaceId = resolveOwningRuntimeSurfaceId(props.editor.state.doc, props.getPos);
  const isPresented =
    presentedSurfaceId === undefined ||
    (presentedSurfaceId !== null && owningSurfaceId === presentedSurfaceId);
  const recordedSectionRef = useRef<{
    session: XapiSession;
    sectionId: string;
  } | null>(null);
  const activeIndex = pages.findIndex((page) => page.id === activeId);

  useEffect(() => {
    if (!isPresented) {
      recordedSectionRef.current = null;
      return;
    }
    if (!xapiSession || !activeId || activeIndex < 0) return;
    const previous = recordedSectionRef.current;
    if (previous?.session === xapiSession && previous.sectionId === activeId) return;

    try {
      xapiSession.record(
        buildLayoutSectionExperiencedStatementDraft({
          rootActivityId: xapiSession.rootActivityId,
          layoutId,
          sectionId: activeId,
          layoutKind: "paginated",
          position: activeIndex + 1,
          count: pages.length,
        }),
      );
      recordedSectionRef.current = { session: xapiSession, sectionId: activeId };
    } catch {
      // Layout recording is observational and cannot make content unavailable.
    }
  }, [activeId, activeIndex, isPresented, layoutId, pages.length, xapiSession]);

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
