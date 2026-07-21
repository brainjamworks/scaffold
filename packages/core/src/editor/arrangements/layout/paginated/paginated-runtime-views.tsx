import { NodeViewContent } from "@tiptap/react";

import { useLayoutInteractionStore } from "../shared/model/layout-interaction-store";
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
import "./paginated.css";

export function PaginatedLayoutRuntimeView(props: LayoutRuntimeViewProps) {
  const layoutId = readRequiredPaginatedNodeId(props.node.attrs["id"], "layout");
  const pages = readPaginatedPages(props.node);
  const storedActiveId = useLayoutInteractionStore((state) => state.activePageByLayoutId[layoutId]);
  const setActivePage = useLayoutInteractionStore((state) => state.setActivePage);
  const activeId = normalizeActivePageId(storedActiveId, pages);

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
  const storedActiveId = useLayoutInteractionStore((state) => state.activePageByLayoutId[layoutId]);
  const activeId = normalizeActivePageId(storedActiveId, pages);
  const isActive = pageId === activeId;

  return (
    <div
      {...paginatedPanelAttributes({ layoutId, pageId, isActive })}
      className="sc-paginated-layout__panel"
    >
      <NodeViewContent
        data-bounded-viewport="fill"
        className="sc-layout-section__content sc-paginated-layout__page-content"
      />
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
