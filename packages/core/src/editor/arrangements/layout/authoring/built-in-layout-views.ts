import { builtInLayoutRegistry } from "../model/built-in-layout-definitions";
import type { LayoutViewRegistration } from "./layout-view-definition";
import { createLayoutAuthoringViewRegistry } from "./layout-view-registry";
import {
  AccordionLayoutView,
  AccordionSectionView,
  accordionSectionFrame,
} from "../accordion/accordion-views";
import {
  ProcessFlowLayoutView,
  ProcessFlowSectionView,
  processFlowSectionFrame,
} from "../process-flow/process-flow-views";
import {
  PaginatedLayoutView,
  PaginatedSectionView,
  paginatedSectionFrame,
} from "../paginated/paginated-views";
import { TabsLayoutView, TabsSectionView, tabsSectionFrame } from "../tabs/tabs-views";

export const builtInLayoutAuthoringViews = Object.freeze([
  {
    id: "accordion",
    layout: AccordionLayoutView,
    section: AccordionSectionView,
    sectionFrame: accordionSectionFrame,
  },
  {
    id: "paginated",
    layout: PaginatedLayoutView,
    section: PaginatedSectionView,
    sectionFrame: paginatedSectionFrame,
  },
  {
    id: "process-flow",
    layout: ProcessFlowLayoutView,
    section: ProcessFlowSectionView,
    sectionFrame: processFlowSectionFrame,
  },
  {
    id: "tabs",
    layout: TabsLayoutView,
    section: TabsSectionView,
    sectionFrame: tabsSectionFrame,
  },
] as const satisfies readonly LayoutViewRegistration[]);

export const builtInLayoutAuthoringViewRegistry = createLayoutAuthoringViewRegistry(
  builtInLayoutRegistry,
  builtInLayoutAuthoringViews,
);
