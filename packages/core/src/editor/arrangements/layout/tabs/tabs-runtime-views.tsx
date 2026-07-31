import { NodeViewContent } from "@tiptap/react";
import { useEffect, useRef, type KeyboardEvent } from "react";

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
  type TabsSectionSummary,
} from "./tabs-components";

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
  const activeId = normalizeActiveTabId(storedActiveId, sections);
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
  const activeIndex = sections.findIndex((section) => section.id === activeId);

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
          layoutKind: "tabs",
          position: activeIndex + 1,
          count: sections.length,
        }),
      );
      recordedSectionRef.current = { session: xapiSession, sectionId: activeId };
    } catch {
      // Layout recording is observational and cannot make content unavailable.
    }
  }, [activeId, activeIndex, isPresented, layoutId, sections.length, xapiSession]);

  return (
    <div className="sc-tabs">
      <TabsList label={options.label} variant={renderTabsVariant(options.variant)}>
        {sections.map((section) => {
          const isActive = section.id === activeId;
          return (
            <TabsItem key={section.id} isActive={isActive}>
              <TabsTrigger
                layoutId={layoutId}
                section={section}
                isActive={isActive}
                onActivate={() => setActiveTab(layoutId, section.id)}
                onKeyDown={(event) =>
                  handleTabsKeyDown({
                    event,
                    layoutId,
                    sectionId: section.id,
                    sections,
                    setActiveTab,
                  })
                }
              />
            </TabsItem>
          );
        })}
      </TabsList>
      <NodeViewContent className="sc-tabs__content" />
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
    <div {...tabsPanelAttributes({ layoutId, sectionId, isActive })} className="sc-tabs__panel">
      <div data-bounded-scroll-frame="">
        <NodeViewContent
          data-bounded-scroll=""
          className="sc-layout-section__content sc-tabs__panel-content"
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
    className: "sc-tabs__panel-frame",
  };
}

function handleTabsKeyDown({
  event,
  layoutId,
  sectionId,
  sections,
  setActiveTab,
}: {
  event: KeyboardEvent<HTMLButtonElement>;
  layoutId: string;
  sectionId: string;
  sections: readonly TabsSectionSummary[];
  setActiveTab: (layoutId: string, sectionId: string) => void;
}) {
  const next = nextTabForKey({ key: event.key, sectionId, sections });
  if (!next) return;
  event.preventDefault();
  setActiveTab(layoutId, next.id);
  focusTabTrigger(layoutId, next.id);
}
