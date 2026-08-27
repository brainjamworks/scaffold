import { NodeViewContent } from "@tiptap/react";
import { useEffect, useRef, type KeyboardEvent } from "react";

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
  tabsPanelAttributes,
  tabPanelId,
  type TabsSectionSummary,
} from "./tabs-components";
import { useTabsControlBinding } from "./tabs-control-binding";

import "@/editor/bounded-containers/view/bounded-container.css";
import { BoundedScrollHint } from "@/editor/bounded-containers/view/bounded-scroll";
import "./tabs.css";

export function TabsLayoutRuntimeView(props: LayoutRuntimeViewProps) {
  const layoutId = readRequiredTabsNodeId(props.node.attrs["id"], "layout");
  const options = readTabsOptions(props.node.attrs["options"]);
  const sections = readTabsSections(props.node);
  const storedActiveId = useLayoutInteractionStore(
    props.editor,
    (state) => state.activeTabByLayoutId[layoutId],
  );
  const setActiveTab = useLayoutInteractionStore(props.editor, (state) => state.setActiveTab);
  const lastSectionChange = useLayoutInteractionStore(
    props.editor,
    (state) => state.lastSectionChangeByLayoutId[layoutId],
  );
  const activeId = normalizeActiveTabId(storedActiveId, sections);
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
  const activeIndex = sections.findIndex((section) => section.id === activeId);
  const commitLearnerSelection = useTabsControlBinding({
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
    if (!isPresented) {
      recordedSectionRef.current = null;
      return;
    }
    if (!activeId || activeIndex < 0) return;
    if (
      (lastSectionChange?.origin === "semantic-activation" ||
        lastSectionChange?.origin === "control-command") &&
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
        layoutKind: "tabs",
        position: activeIndex + 1,
        count: sections.length,
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
    sections.length,
  ]);

  return (
    <div className="sc-course-tabs">
      <TabsList label={options.label} variant={renderTabsVariant(options.variant)}>
        {sections.map((section) => {
          const isActive = section.id === activeId;
          return (
            <TabsItem key={section.id} isActive={isActive}>
              <TabsTrigger
                layoutId={layoutId}
                section={section}
                isActive={isActive}
                onActivate={() => commitLearnerSelection(section.id)}
                onKeyDown={(event) =>
                  handleTabsKeyDown({
                    event,
                    layoutId,
                    sectionId: section.id,
                    sections,
                    commitLearnerSelection,
                  })
                }
              />
            </TabsItem>
          );
        })}
      </TabsList>
      <NodeViewContent className="sc-course-tabs__content" />
    </div>
  );
}

export function TabsSectionRuntimeView(props: SectionRuntimeViewProps) {
  const layoutId = readRequiredTabsNodeId(props.layoutNode?.attrs["id"], "layout");
  const sectionId = readRequiredTabsNodeId(props.node.attrs["id"], "section");
  const sections = readTabsSections(props.layoutNode);
  const storedActiveId = useLayoutInteractionStore(
    props.editor,
    (state) => state.activeTabByLayoutId[layoutId],
  );
  const activeId = normalizeActiveTabId(storedActiveId, sections);
  const isActive = sectionId === activeId;

  return (
    <div
      {...tabsPanelAttributes({ layoutId, sectionId, isActive, focusable: true })}
      className="sc-course-tabs__panel"
    >
      <div data-bounded-scroll-frame="">
        <props.ContentRoot
          data-bounded-scroll=""
          className="sc-layout-section__content sc-course-tabs__panel-content"
        />
        <BoundedScrollHint />
      </div>
    </div>
  );
}

export function tabsRuntimeSectionFrame(
  _props: SectionRuntimeViewProps,
): SectionRuntimeFrameOptions {
  return {
    className: "sc-course-tabs__panel-frame",
  };
}

function handleTabsKeyDown({
  event,
  layoutId,
  sectionId,
  sections,
  commitLearnerSelection,
}: {
  event: KeyboardEvent<HTMLButtonElement>;
  layoutId: string;
  sectionId: string;
  sections: readonly TabsSectionSummary[];
  commitLearnerSelection: (sectionId: string) => void;
}) {
  const next = nextTabForKey({ key: event.key, sectionId, sections });
  if (!next) return;
  event.preventDefault();
  commitLearnerSelection(next.id);
  focusTabTrigger(layoutId, next.id);
}
