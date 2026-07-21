import { NodeViewContent, useEditorState } from "@tiptap/react";
import type { EditorState } from "@tiptap/pm/state";
import { useEffect } from "react";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { setNonDestructiveSelectionNearWithinRangeInTransaction } from "@/editor/selection/selection-transactions";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import { projectInteractionContextOwners } from "@/editor/interactions/targets/prosemirror/projection/context-owner-projection";

import { layoutSectionPositionAt } from "../model/layout-arrangement-helpers";
import {
  activateLayoutInteractionTarget,
  LayoutAddGhost,
  SectionActionTrigger,
} from "../authoring/layout-chrome";
import { useLayoutInteractionStore } from "../shared/model/layout-interaction-store";
import type {
  LayoutComponentProps,
  SectionComponentProps,
  SectionFrameProps,
} from "../authoring/layout-view-definition";
import {
  PaginatedLayoutShell,
  normalizeActivePageId,
  paginatedPanelAttributes,
  readPaginatedPages,
  readRequiredPaginatedNodeId,
  type PaginatedPageSummary,
} from "./paginated-components";

import "@/editor/bounded-containers/view/bounded-container.css";
import "./paginated.css";

export function PaginatedLayoutView(props: LayoutComponentProps) {
  const layoutPos = resolveLayoutPos(props);
  const layoutId = readRequiredPaginatedNodeId(props.node.attrs["id"], "layout");
  const pages = readPaginatedPages(props.node);
  const storedActiveId = useLayoutInteractionStore((state) => state.activePageByLayoutId[layoutId]);
  const setActivePage = useLayoutInteractionStore((state) => state.setActivePage);
  const selectionState = useEditorState({
    editor: props.editor,
    selector: ({ editor }) =>
      resolvePaginatedLayoutSelectionState(editor.state, layoutId, pages, props.blockDefinitions),
  });
  const activeId = normalizeActivePageId(storedActiveId, pages);
  const addLabel = props.definition?.section?.addLabel ?? "Add page";
  const activatePage = (pageId: string, pageIndex: number) => {
    const selectionPageId = resolvePaginatedSelectionPageId(props.editor.state, layoutId, pages);
    setActivePage(layoutId, pageId);
    if (selectionPageId && selectionPageId !== pageId && pageIndex >= 0) {
      focusPaginatedSectionContent({
        editor: props.editor,
        layoutPos,
        sectionIndex: pageIndex,
      });
    }
  };
  const activateLayout = () => {
    activateLayoutInteractionTarget({
      blockDefinitions: props.blockDefinitions,
      editor: props.editor,
      layoutPos,
    });
  };

  useEffect(() => {
    const selectionPageId = selectionState.pageId;
    if (!selectionPageId || selectionPageId === activeId) return;
    setActivePage(layoutId, selectionPageId);
  }, [activeId, layoutId, selectionState.pageId, selectionState.signature, setActivePage]);

  return (
    <div className="sc-paginated-layout sc-paginated-layout--authoring">
      <PaginatedLayoutShell
        activeId={activeId}
        layoutId={layoutId}
        onActivate={(pageId) => {
          activatePage(
            pageId,
            pages.findIndex((page) => page.id === pageId),
          );
          activateLayout();
        }}
        pages={pages}
        footer={
          props.editable && props.definition?.section ? (
            <LayoutAddGhost
              editor={props.editor}
              getPos={props.getPos}
              label={addLabel}
              layoutId={layoutId}
              onSectionAdded={({ sectionId }) => {
                if (sectionId) setActivePage(layoutId, sectionId);
                activateLayout();
              }}
              presentation="icon"
              className="sc-paginated-layout__add"
            />
          ) : null
        }
      >
        <NodeViewContent className="sc-paginated-layout__content" />
      </PaginatedLayoutShell>
    </div>
  );
}

function resolveLayoutPos(props: LayoutComponentProps): number | null {
  try {
    const pos = props.getPos();
    return isValidEditorDocPos(props.editor, pos) ? pos : null;
  } catch {
    return null;
  }
}

export function PaginatedSectionView(props: SectionComponentProps) {
  const liveState = useEditorState({
    editor: props.editor,
    selector: () => resolveLivePaginatedSectionState(props),
  });
  const storedActiveId = useLayoutInteractionStore(
    (state) => state.activePageByLayoutId[liveState.layoutId],
  );
  const activeId = normalizeActivePageId(storedActiveId, liveState.pages);
  const isActive = liveState.pageId === activeId;
  const layoutPos = resolveSectionLayoutPos(props);
  const { index: pageIndex } = useEditorState({
    editor: props.editor,
    selector: () => resolveSectionPosition(props),
  });

  return (
    <div
      {...paginatedPanelAttributes({
        layoutId: liveState.layoutId,
        pageId: liveState.pageId,
        isActive,
      })}
      className="sc-paginated-layout__panel"
    >
      {props.editable && layoutPos !== null ? (
        <SectionActionTrigger
          blockDefinitions={props.blockDefinitions}
          editor={props.editor}
          layoutPos={layoutPos}
          sectionId={liveState.pageId}
          sectionIndex={pageIndex}
          className="sc-paginated-layout__action"
        />
      ) : null}
      <NodeViewContent
        data-bounded-viewport="fill"
        className="sc-layout-section__content sc-paginated-layout__page-content"
      />
    </div>
  );
}

export function paginatedSectionFrame(_props: SectionComponentProps): SectionFrameProps {
  return {
    className: "sc-paginated-layout__section",
  };
}

function focusPaginatedSectionContent({
  editor,
  layoutPos,
  sectionIndex,
}: {
  editor: LayoutComponentProps["editor"];
  layoutPos: number | null;
  sectionIndex: number;
}) {
  if (layoutPos === null) return;
  const sectionPos = layoutSectionPositionAt(editor.state.doc, layoutPos, sectionIndex);
  if (sectionPos === null) return;
  const section = editor.state.doc.nodeAt(sectionPos);
  if (!section || section.type.name !== "section") return;

  const tr = editor.state.tr;
  const didSetSelection = setNonDestructiveSelectionNearWithinRangeInTransaction(
    tr,
    sectionPos + 1,
    {
      from: sectionPos,
      to: sectionPos + section.nodeSize,
    },
  );
  if (!didSetSelection) return;

  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
}

interface PaginatedLayoutSelectionState {
  pageId: string | null;
  signature: string;
}

function resolvePaginatedSelectionPageId(
  state: EditorState,
  layoutId: string,
  pages: readonly PaginatedPageSummary[],
): string | null {
  const contextOwners = projectInteractionContextOwners(state.selection);
  const contextLayout = contextOwners.layout;
  const contextSection = contextOwners.section;

  if (contextLayout?.id !== layoutId || !contextSection?.id) return null;
  return pages.some((page) => page.id === contextSection.id) ? contextSection.id : null;
}

function resolvePaginatedLayoutSelectionState(
  state: EditorState,
  layoutId: string,
  pages: readonly PaginatedPageSummary[],
  blockDefinitions: LayoutComponentProps["blockDefinitions"],
): PaginatedLayoutSelectionState {
  const signature = [
    state.selection.constructor.name,
    state.selection.from,
    state.selection.to,
  ].join(":");
  const owners = publishInteractionOwnerSnapshot(state, null, {
    blockDefinitions,
  }).owners;
  const ownerRef = owners.menuOwner.target ?? owners.explicitOwner.target;
  if (ownerRef) {
    return { pageId: null, signature };
  }

  const contextLayout = owners.contextOwners.layout;
  const contextSection = owners.contextOwners.section;

  if (contextLayout?.id !== layoutId || !contextSection?.id) {
    return { pageId: null, signature };
  }

  return {
    pageId: pages.some((page) => page.id === contextSection.id) ? contextSection.id : null,
    signature,
  };
}

function resolveSectionLayoutPos(props: SectionComponentProps): number | null {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) return null;
    const $pos = props.editor.state.doc.resolve(pos);
    return $pos.before($pos.depth);
  } catch {
    return null;
  }
}

function resolveSectionPosition(props: SectionComponentProps): {
  index: number;
} {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) return { index: 0 };
    const $pos = props.editor.state.doc.resolve(pos);
    return { index: $pos.index() };
  } catch {
    return { index: 0 };
  }
}

function resolveLivePaginatedSectionState(props: SectionComponentProps) {
  const fallbackLayoutId = readRequiredPaginatedNodeId(props.layoutNode?.attrs["id"], "layout");
  const fallbackPageId = readRequiredPaginatedNodeId(props.node.attrs["id"], "section");
  const fallbackPages = readPaginatedPages(props.layoutNode);

  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) {
      return {
        layoutId: fallbackLayoutId,
        pageId: fallbackPageId,
        pages: fallbackPages,
      };
    }

    const section = props.editor.state.doc.nodeAt(pos);
    const resolved = props.editor.state.doc.resolve(pos);
    if (!section || section.type.name !== "section" || resolved.parent.type.name !== "layout") {
      return {
        layoutId: fallbackLayoutId,
        pageId: fallbackPageId,
        pages: fallbackPages,
      };
    }

    return {
      layoutId: readRequiredPaginatedNodeId(resolved.parent.attrs["id"], "layout"),
      pageId: readRequiredPaginatedNodeId(section.attrs["id"], "section"),
      pages: readPaginatedPages(resolved.parent),
    };
  } catch {
    return {
      layoutId: fallbackLayoutId,
      pageId: fallbackPageId,
      pages: fallbackPages,
    };
  }
}
