import { accordionLayoutDefinition } from "../accordion/accordion-definition";
import { paginatedLayoutDefinition } from "../paginated/paginated-definition";
import { tabsLayoutDefinition } from "../tabs/tabs-definition";
import type { LayoutDefinition } from "./layout-definition";
import { createLayoutRegistry } from "./layout-registry";

export const builtInLayoutDefinitions: readonly LayoutDefinition[] = Object.freeze([
  accordionLayoutDefinition,
  paginatedLayoutDefinition,
  tabsLayoutDefinition,
]);

export const builtInLayoutRegistry = createLayoutRegistry(builtInLayoutDefinitions);
