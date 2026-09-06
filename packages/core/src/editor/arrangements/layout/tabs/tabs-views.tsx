import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { NodeViewContent, useEditorState } from "@tiptap/react";
import type { EditorState } from "@tiptap/pm/state";
import { useCallback, useEffect, useMemo, type KeyboardEvent } from "react";

import { getEditorNavigationForState } from "@/document/authoring/editor-navigation";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { setNonDestructiveSelectionNearWithinRangeInTransaction } from "@/editor/selection/selection-transactions";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import { projectInteractionContextOwners } from "@/editor/interactions/targets/prosemirror/projection/context-owner-projection";

import { layoutSectionPositionAt } from "../model/layout-arrangement-helpers";
import {
  activateLayoutInteractionTarget,
  LayoutAddGhost,
  SectionActionTrigger,
  SectionMovementHandle,
} from "../authoring/layout-chrome";
import {
  getLayoutInteractionStoreState,
  useLayoutInteractionStore,
} from "../shared/model/layout-interaction-store";
import { useLayoutSemanticActivationBinding } from "../shared/model/use-layout-semantic-activation-binding";
import type {
  LayoutComponentProps,
  SectionComponentProps,
  SectionFrameProps,
} from "../authoring/layout-view-definition";
import {
  TabsItem,
  TabsList,
  TabsTrigger,
  focusTabTrigger,
  nextTabForKey,
  normalizeActiveTabId,
  readRequiredTabsNodeId,
  readTabsOptions,
  readTabsSections,
  renderTabsVariant,
  tabPanelId,
  tabTriggerId,
  tabsPanelAttributes,
  type TabsSectionSummary,
} from "./tabs-components";
import { createTabsAuthoringReorderProjection } from "./tabs-authoring-reorder-projection";
import { useTabsControlBinding } from "./tabs-control-binding";

import "@/editor/bounded-containers/view/bounded-container.css";
import { BoundedScrollHint } from "@/editor/bounded-containers/view/bounded-scroll";
import "./tabs.css";

export function TabsLayoutView(props: LayoutComponentProps) {
  const layoutPos = resolveLayoutPos(props);
  const layoutId = resolveLayoutId(props);
  const options = readTabsOptions(props.node.attrs["options"]);
  const sections = readTabsSections(props.node);
  const editorNavigation = getEditorNavigationForState(props.editor.state);
  const storedActiveId = useLayoutInteractionStore(
    props.editor,
    (state) => state.activeTabByLayoutId[layoutId],
  );
  const setActiveTab = useLayoutInteractionStore(props.editor, (state) => state.setActiveTab);
  const selectionState = useEditorState({
    editor: props.editor,
    selector: ({ editor }) =>
      resolveTabsLayoutSelectionState(editor.state, layoutId, sections, props.blockDefinitions),
  });
  const activeId = normalizeActiveTabId(storedActiveId, sections);
  const addLabel = props.definition?.section?.addLabel ?? "Add tab";
  useTabsControlBinding({
    editor: props.editor,
    getPos: props.getPos,
    layoutId,
    node: props.node,
  });
  const activateTab = (sectionId: string, sectionIndex: number) => {
    const selectionSectionId = resolveTabsSelectionSectionId(
      props.editor.state,
      layoutId,
      sections,
    );
    setActiveTab(layoutId, sectionId);
    if (selectionSectionId && selectionSectionId !== sectionId && sectionIndex >= 0) {
      focusTabSectionContent({
        editor: props.editor,
        layoutPos,
        sectionIndex,
      });
    }
    const semanticSectionId = EmbeddedNodeIdSchema.safeParse(sectionId);
    if (semanticSectionId.success) {
      editorNavigation.reportComponentSelection(semanticSectionId.data);
    }
  };
  const activateLayout = () => {
    activateLayoutInteractionTarget({
      blockDefinitions: props.blockDefinitions,
      editor: props.editor,
      layoutPos,
    });
  };

  useLayoutSemanticActivationBinding({
    editor: props.editor,
    getPos: props.getPos,
    layoutId,
    node: props.node,
    isVisible: (childId) => {
      const storedActiveId = getLayoutInteractionStoreState(props.editor).activeTabByLayoutId[
        layoutId
      ];
      return normalizeActiveTabId(storedActiveId, readTabsSections(props.node)) === childId;
    },
    revealChild: (childId) => setActiveTab(layoutId, childId, { origin: "semantic-activation" }),
    visibilityElementId: (childId) => tabPanelId(layoutId, childId),
  });

  useEffect(() => {
    const selectionSectionId = selectionState.sectionId;
    if (!selectionSectionId) return;
    const currentSections = readTabsSections(props.node);
    const storedActiveId = getLayoutInteractionStoreState(props.editor).activeTabByLayoutId[
      layoutId
    ];
    if (selectionSectionId === normalizeActiveTabId(storedActiveId, currentSections)) return;
    setActiveTab(layoutId, selectionSectionId);
  }, [
    layoutId,
    props.editor,
    props.node,
    selectionState.sectionId,
    selectionState.signature,
    setActiveTab,
  ]);

  return (
    <div className="sc-course-tabs">
      <TabsList
        label={options.label}
        ownedTabIds={sections.map((section) => tabTriggerId(layoutId, section.id))}
        variant={renderTabsVariant(options.variant)}
      >
        {sections.map((section, index) => (
          <TabsAuthoringItem
            key={section.id}
            activateLayout={activateLayout}
            activateTab={activateTab}
            blockDefinitions={props.blockDefinitions}
            editable={props.editable}
            editor={props.editor}
            isActive={section.id === activeId}
            layoutId={layoutId}
            layoutPos={layoutPos}
            section={section}
            sectionIndex={index}
            sections={sections}
          />
        ))}
        {props.editable ? (
          <LayoutAddGhost
            editor={props.editor}
            getPos={props.getPos}
            label={addLabel}
            layoutId={layoutId}
            onSectionAdded={({ sectionId }) => {
              const sectionIndex = sections.findIndex((section) => section.id === sectionId);
              if (sectionId) {
                activateTab(sectionId, sectionIndex);
              }
            }}
            className="sc-app-tabs-add"
          />
        ) : null}
      </TabsList>
      <NodeViewContent className="sc-course-tabs__content" />
    </div>
  );
}

function TabsAuthoringItem({
  activateLayout,
  activateTab,
  blockDefinitions,
  editable,
  editor,
  isActive,
  layoutId,
  layoutPos,
  section,
  sectionIndex,
  sections,
}: {
  activateLayout: () => void;
  activateTab: (sectionId: string, sectionIndex: number) => void;
  blockDefinitions: LayoutComponentProps["blockDefinitions"];
  editable: boolean;
  editor: LayoutComponentProps["editor"];
  isActive: boolean;
  layoutId: string;
  layoutPos: number | null;
  section: TabsSectionSummary;
  sectionIndex: number;
  sections: readonly TabsSectionSummary[];
}) {
  const getPresentationElement = useCallback(
    () =>
      editor.view.dom.ownerDocument
        .getElementById(tabTriggerId(layoutId, section.id))
        ?.closest<HTMLElement>("[data-course-tabs-item]") ?? null,
    [editor, layoutId, section.id],
  );
  const reorderProjection = useMemo(
    () => createTabsAuthoringReorderProjection(getPresentationElement),
    [getPresentationElement],
  );

  return (
    <TabsItem isActive={isActive}>
      {editable ? (
        <SectionMovementHandle
          axis="horizontal"
          editor={editor}
          getPresentationElement={getPresentationElement}
          layoutPos={layoutPos}
          projection={reorderProjection}
          sectionId={section.id}
          sectionIndex={sectionIndex}
          className="sc-app-tabs-handle"
        />
      ) : null}
      <TabsTrigger
        layoutId={layoutId}
        section={section}
        isActive={isActive}
        onActivate={() => {
          activateTab(section.id, sectionIndex);
          activateLayout();
        }}
        onKeyDown={(event) =>
          handleTabsKeyDown({
            activateLayout,
            activateTab,
            editor,
            event,
            layoutPos,
            layoutId,
            sectionId: section.id,
            sectionIndex,
            sections,
          })
        }
      />
      {editable ? (
        <SectionActionTrigger
          blockDefinitions={blockDefinitions}
          editor={editor}
          layoutPos={layoutPos}
          sectionId={section.id}
          sectionIndex={sectionIndex}
          className="sc-app-tabs-action"
        />
      ) : null}
    </TabsItem>
  );
}

export function TabsSectionView(props: SectionComponentProps) {
  const liveState = useEditorState({
    editor: props.editor,
    selector: () => resolveLiveTabsSectionState(props),
  });
  const { layoutId, sectionId, sections } = liveState;
  const storedActiveId = useLayoutInteractionStore(
    props.editor,
    (state) => state.activeTabByLayoutId[layoutId],
  );
  const activeId = normalizeActiveTabId(storedActiveId, sections);
  const isActive = sectionId === activeId;

  return (
    <div
      {...tabsPanelAttributes({ layoutId, sectionId, isActive })}
      className="sc-course-tabs__panel"
    >
      <div data-bounded-scroll-frame="">
        <NodeViewContent
          data-bounded-scroll=""
          className="sc-layout-section__content sc-course-tabs__panel-content"
        />
        <BoundedScrollHint editable={props.editable} />
      </div>
    </div>
  );
}

export function tabsSectionFrame(props: SectionComponentProps): SectionFrameProps {
  const layoutId = readRequiredTabsNodeId(props.layoutNode?.attrs["id"], "layout");
  const sectionId = readRequiredTabsNodeId(props.node.attrs["id"], "section");

  return {
    className: "sc-course-tabs__panel-frame",
    movementTargetPresentation: {
      axis: "horizontal",
      resolveElement: (sectionFrame) => {
        const tabItem = props.editor.view.dom.ownerDocument
          .getElementById(tabTriggerId(layoutId, sectionId))
          ?.closest("[data-course-tabs-item]");
        return tabItem?.closest(".sc-course-tabs") === sectionFrame.closest(".sc-course-tabs")
          ? tabItem
          : null;
      },
    },
  };
}

function handleTabsKeyDown({
  activateLayout,
  activateTab,
  editor,
  event,
  layoutPos,
  layoutId,
  sectionId,
  sectionIndex,
  sections,
}: {
  activateLayout: () => void;
  activateTab: (sectionId: string, sectionIndex: number) => void;
  editor: LayoutComponentProps["editor"];
  event: KeyboardEvent<HTMLButtonElement>;
  layoutPos: number | null;
  layoutId: string;
  sectionId: string;
  sectionIndex: number;
  sections: readonly TabsSectionSummary[];
}) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    activateTab(sectionId, sectionIndex);
    activateLayout();
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    activateTab(sectionId, sectionIndex);
    activateLayout();
    focusTabSectionContent({
      editor,
      layoutPos,
      sectionIndex,
    });
    return;
  }

  const next = nextTabForKey({ key: event.key, sectionId, sections });
  if (!next) return;
  event.preventDefault();
  activateTab(
    next.id,
    sections.findIndex((section) => section.id === next.id),
  );
  activateLayout();
  focusTabTrigger(layoutId, next.id);
}

function focusTabSectionContent({
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

interface TabsSectionLiveState {
  layoutId: string;
  sectionId: string;
  sections: TabsSectionSummary[];
}

interface TabsLayoutSelectionState {
  sectionId: string | null;
  signature: string;
}

function resolveTabsSelectionSectionId(
  state: EditorState,
  layoutId: string,
  sections: readonly TabsSectionSummary[],
): string | null {
  const contextOwners = projectInteractionContextOwners(state.selection);
  const contextLayout = contextOwners.layout;
  const contextSection = contextOwners.section;

  if (contextLayout?.id !== layoutId || !contextSection?.id) return null;
  return sections.some((section) => section.id === contextSection.id) ? contextSection.id : null;
}

function resolveTabsLayoutSelectionState(
  state: EditorState,
  layoutId: string,
  sections: readonly TabsSectionSummary[],
  blockDefinitions: LayoutComponentProps["blockDefinitions"],
): TabsLayoutSelectionState {
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
    return { sectionId: null, signature };
  }

  const contextLayout = owners.contextOwners.layout;
  const contextSection = owners.contextOwners.section;

  if (contextLayout?.id !== layoutId || !contextSection?.id) {
    return { sectionId: null, signature };
  }

  return {
    sectionId: sections.some((section) => section.id === contextSection.id)
      ? contextSection.id
      : null,
    signature,
  };
}

function resolveLiveTabsSectionState(props: SectionComponentProps): TabsSectionLiveState {
  const layoutId = resolveSectionLayoutId(props);
  const sectionId = resolveSectionId(props);
  const fallbackSections = readTabsSections(props.layoutNode);

  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) {
      return {
        layoutId,
        sectionId,
        sections: fallbackSections,
      };
    }

    const section = props.editor.state.doc.nodeAt(pos);
    const resolved = props.editor.state.doc.resolve(pos);
    if (!section || section.type.name !== "section" || resolved.parent.type.name !== "layout") {
      return {
        layoutId,
        sectionId,
        sections: fallbackSections,
      };
    }

    const layout = resolved.parent;

    return {
      layoutId: readRequiredTabsNodeId(layout.attrs["id"], "layout"),
      sectionId: readRequiredTabsNodeId(section.attrs["id"], "section"),
      sections: readTabsSections(layout),
    };
  } catch {
    return {
      layoutId,
      sectionId,
      sections: fallbackSections,
    };
  }
}

function resolveLayoutId(props: LayoutComponentProps): string {
  return readRequiredTabsNodeId(props.node.attrs["id"], "layout");
}

function resolveSectionLayoutId(props: SectionComponentProps): string {
  return readRequiredTabsNodeId(props.layoutNode?.attrs["id"], "layout");
}

function resolveSectionId(props: SectionComponentProps): string {
  return readRequiredTabsNodeId(props.node.attrs["id"], "section");
}

function resolveLayoutPos(props: LayoutComponentProps): number | null {
  try {
    const pos = props.getPos();
    if (isValidEditorDocPos(props.editor, pos)) return pos;
  } catch {
    return null;
  }
  return null;
}
