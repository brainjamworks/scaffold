import type { DocumentSemanticsDefinition } from "./definition";

/** Owns the immutable shell shared by Block, Layout and Surface definitions. */
export function normalizeDocumentSemanticsDefinition(
  definition: DocumentSemanticsDefinition | undefined,
): DocumentSemanticsDefinition | undefined {
  if (!definition) return undefined;

  const presentation = definition.presentation
    ? Object.freeze({
        ...definition.presentation,
        actionIds: Object.freeze([...definition.presentation.actionIds]),
        ...(definition.presentation.reconstructableCommandTypes
          ? {
              reconstructableCommandTypes: Object.freeze([
                ...new Set(definition.presentation.reconstructableCommandTypes),
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
