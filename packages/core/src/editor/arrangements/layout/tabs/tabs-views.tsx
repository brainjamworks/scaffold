import { NodeViewContent, useEditorState } from "@tiptap/react";
import type { EditorState } from "@tiptap/pm/state";
import { useEffect, type KeyboardEvent } from "react";

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
import { useLayoutInteractionStore } from "../shared/model/layout-interaction-store";
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
  tabsGhostPresentation,
  tabsPanelAttributes,
  type TabsSectionSummary,
} from "./tabs-components";

import "@/editor/bounded-containers/view/bounded-container.css";
import "./tabs.css";

export function TabsLayoutView(props: LayoutComponentProps) {
  const layoutPos = resolveLayoutPos(props);
  const layoutId = resolveLayoutId(props);
  const options = readTabsOptions(props.node.attrs["options"]);
  const sections = readTabsSections(props.node);
  const storedActiveId = useLayoutInteractionStore((state) => state.activeTabByLayoutId[layoutId]);
  const setActiveTab = useLayoutInteractionStore((state) => state.setActiveTab);
  const selectionState = useEditorState({
    editor: props.editor,
    selector: ({ editor }) =>
      resolveTabsLayoutSelectionState(editor.state, layoutId, sections, props.blockDefinitions),
  });
  const activeId = normalizeActiveTabId(storedActiveId, sections);
  const addLabel = props.definition?.section?.addLabel ?? "Add tab";
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
  };
  const activateLayout = () => {
    activateLayoutInteractionTarget({
      blockDefinitions: props.blockDefinitions,
      editor: props.editor,
      layoutPos,
    });
  };

  useEffect(() => {
    const selectionSectionId = selectionState.sectionId;
    if (!selectionSectionId || selectionSectionId === activeId) return;
    setActiveTab(layoutId, selectionSectionId);
  }, [activeId, layoutId, selectionState.sectionId, selectionState.signature, setActiveTab]);

  return (
    <div className="sc-tabs">
      <TabsList label={options.label} variant={renderTabsVariant(options.variant)}>
        {sections.map((section, index) => {
          const isActive = section.id === activeId;

          return (
            <TabsItem key={section.id} isActive={isActive}>
              {props.editable ? (
                <SectionMovementHandle
                  editor={props.editor}
                  layoutPos={layoutPos}
                  sectionId={section.id}
                  sectionIndex={index}
                  className="sc-tabs__handle"
                />
              ) : null}
              <TabsTrigger
                layoutId={layoutId}
                section={section}
                isActive={isActive}
                onActivate={() => {
                  activateTab(section.id, index);
                  activateLayout();
                }}
                onKeyDown={(event) =>
                  handleTabsKeyDown({
                    activateLayout,
                    activateTab,
                    editor: props.editor,
                    event,
                    layoutPos,
                    layoutId,
                    sectionId: section.id,
                    sectionIndex: index,
                    sections,
                  })
                }
              />
              {props.editable ? (
                <SectionActionTrigger
                  blockDefinitions={props.blockDefinitions}
                  editor={props.editor}
                  layoutPos={layoutPos}
                  sectionId={section.id}
                  sectionIndex={index}
                  className="sc-tabs__action"
                />
              ) : null}
            </TabsItem>
          );
        })}
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
            presentation={tabsGhostPresentation(options.variant)}
          />
        ) : null}
      </TabsList>
      <NodeViewContent className="sc-tabs__content" />
    </div>
  );
}

export function TabsSectionView(props: SectionComponentProps) {
  const liveState = useEditorState({
    editor: props.editor,
    selector: () => resolveLiveTabsSectionState(props),
  });
  const { layoutId, sectionId, sections } = liveState;
  const storedActiveId = useLayoutInteractionStore((state) => state.activeTabByLayoutId[layoutId]);
  const activeId = normalizeActiveTabId(storedActiveId, sections);
  const isActive = sectionId === activeId;

  return (
    <div {...tabsPanelAttributes({ layoutId, sectionId, isActive })} className="sc-tabs__panel">
      <NodeViewContent
        data-bounded-viewport="fill"
        className="sc-layout-section__content sc-tabs__panel-content"
      />
    </div>
  );
}

export function tabsSectionFrame(_props: SectionComponentProps): SectionFrameProps {
  return {
    className: "sc-tabs__panel-frame",
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
