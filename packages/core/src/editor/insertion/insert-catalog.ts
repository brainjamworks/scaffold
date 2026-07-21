import type { InsertAction, InsertCategory } from "./insert-action";

export interface InsertCatalog {
  readonly actions: readonly InsertAction[];
  readonly getById: (id: string) => InsertAction | undefined;
  readonly getByCategory: (category: InsertCategory) => readonly InsertAction[];
}

export function createInsertCatalog(input: readonly InsertAction[]): InsertCatalog {
  const actions = Object.freeze(input.map(copyAction));
  const actionsById = new Map<string, InsertAction>();

  for (const action of actions) {
    if (actionsById.has(action.id)) {
      throw new Error(`Duplicate insert action id "${action.id}".`);
    }
    actionsById.set(action.id, action);
  }

  validateVariants(actions, actionsById);

  const categoryActions = (category: InsertCategory): readonly InsertAction[] =>
    Object.freeze(actions.filter((action) => action.category === category));
  const actionsByCategory = Object.freeze({
    content: categoryActions("content"),
    display: categoryActions("display"),
    media: categoryActions("media"),
    data: categoryActions("data"),
    assessment: categoryActions("assessment"),
    activity: categoryActions("activity"),
    embed: categoryActions("embed"),
    layout: categoryActions("layout"),
  }) satisfies Readonly<Record<InsertCategory, readonly InsertAction[]>>;

  return Object.freeze({
    actions,
    getById: (id: string) => actionsById.get(id),
    getByCategory: (category: InsertCategory) => actionsByCategory[category],
  });
}

function copyAction(action: InsertAction): InsertAction {
  return Object.freeze({
    ...action,
    ...(action.keywords ? { keywords: Object.freeze([...action.keywords]) } : {}),
  });
}

function validateVariants(
  actions: readonly InsertAction[],
  actionsById: ReadonlyMap<string, InsertAction>,
): void {
  for (const action of actions) {
    if (!action.variantOf) continue;
    if (action.variantOf === action.id) {
      throw new Error(`Insert action "${action.id}" cannot be its own variant parent.`);
    }

    const parent = actionsById.get(action.variantOf);
    if (!parent) {
      throw new Error(
        `Insert action "${action.id}" references missing variant parent "${action.variantOf}".`,
      );
    }
    if (parent.nodeType !== action.nodeType) {
      throw new Error(
        `Insert action "${action.id}" targets node type "${action.nodeType}", but its variant parent "${parent.id}" targets "${parent.nodeType}".`,
      );
    }
  }
}
