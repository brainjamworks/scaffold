import { accordionLayoutDefinition } from "../accordion/accordion-definition";
import { paginatedLayoutDefinition } from "../paginated/paginated-definition";
import { processFlowLayoutDefinition } from "../process-flow/process-flow-definition";
import { tabsLayoutDefinition } from "../tabs/tabs-definition";
import type { LayoutDefinition } from "./layout-definition";
import { createLayoutRegistry } from "./layout-registry";

export const builtInLayoutDefinitions: readonly LayoutDefinition[] = Object.freeze([
  accordionLayoutDefinition,
  paginatedLayoutDefinition,
  processFlowLayoutDefinition,
  tabsLayoutDefinition,
]);

export const builtInLayoutRegistry = createLayoutRegistry(builtInLayoutDefinitions);
