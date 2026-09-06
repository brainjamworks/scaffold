import type { DocumentTreeDefinition } from "./definition";

/** Owns the immutable shell shared by Block, Layout and Surface definitions. */
export function normalizeDocumentTreeDefinition(
  definition: DocumentTreeDefinition | undefined,
): DocumentTreeDefinition | undefined {
  if (!definition) return undefined;

  const presentation = definition.presentation
    ? Object.freeze({
        ...definition.presentation,
        actionIds: Object.freeze([...new Set(definition.presentation.actionIds)]),
        ...(definition.presentation.reconstructableCommandTypes
          ? {
              reconstructableCommandTypes: Object.freeze([
                ...definition.presentation.reconstructableCommandTypes,
              ]),
            }
          : {}),
      })
    : undefined;

  return Object.freeze({
    ...definition,
    ...(presentation ? { presentation } : {}),
  });
}
