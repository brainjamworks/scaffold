import { builtInLayoutRegistry } from "../model/built-in-layout-definitions";
import type { LayoutRuntimeViewRegistration } from "./layout-view-definition";
import { createLayoutRuntimeViewRegistry } from "./layout-view-registry";
import {
  AccordionLayoutRuntimeView,
  AccordionSectionRuntimeView,
  accordionRuntimeSectionFrame,
} from "../accordion/accordion-runtime-views";
import {
  PaginatedLayoutRuntimeView,
  PaginatedSectionRuntimeView,
  paginatedRuntimeSectionFrame,
} from "../paginated/paginated-runtime-views";
import {
  ProcessFlowLayoutRuntimeView,
  ProcessFlowSectionRuntimeView,
  processFlowRuntimeSectionFrame,
} from "../process-flow/process-flow-runtime-views";
import {
  TabsLayoutRuntimeView,
  TabsSectionRuntimeView,
  tabsRuntimeSectionFrame,
} from "../tabs/tabs-runtime-views";

export const builtInLayoutRuntimeViews = Object.freeze([
  {
    id: "accordion",
    component: AccordionLayoutRuntimeView,
    sectionComponent: AccordionSectionRuntimeView,
    sectionFrame: accordionRuntimeSectionFrame,
  },
  {
    id: "paginated",
    component: PaginatedLayoutRuntimeView,
    sectionComponent: PaginatedSectionRuntimeView,
    sectionFrame: paginatedRuntimeSectionFrame,
  },
  {
    id: "process-flow",
    component: ProcessFlowLayoutRuntimeView,
    sectionComponent: ProcessFlowSectionRuntimeView,
    sectionFrame: processFlowRuntimeSectionFrame,
  },
  {
    id: "tabs",
    component: TabsLayoutRuntimeView,
    sectionComponent: TabsSectionRuntimeView,
    sectionFrame: tabsRuntimeSectionFrame,
  },
] as const satisfies readonly LayoutRuntimeViewRegistration[]);

export const builtInLayoutRuntimeViewRegistry = createLayoutRuntimeViewRegistry(
  builtInLayoutRegistry,
  builtInLayoutRuntimeViews,
);
