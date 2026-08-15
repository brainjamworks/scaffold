import type { DirectChildContentLayoutState } from "../model/content-layout-projection";

export const CONTENT_LAYOUT_PROJECTION_DOM_ATTRS = Object.freeze({
  accessibility: "data-presentation-accessibility",
  availability: "data-presentation-availability",
  geometry: "data-presentation-geometry",
  interaction: "data-presentation-interaction",
  slot: "data-presentation-slot",
});

export type ContentLayoutProjectionDomAttributes = Readonly<Record<string, string>>;

const EMPTY_ATTRIBUTES: ContentLayoutProjectionDomAttributes = Object.freeze({});

export function contentLayoutProjectionDomAttributes(
  state: DirectChildContentLayoutState,
): ContentLayoutProjectionDomAttributes {
  switch (state.availability) {
    case "normal":
      return EMPTY_ATTRIBUTES;
    case "available":
      return createProjectedAttributes(state);
    case "withheld":
      return Object.freeze({
        ...createProjectedAttributes(state),
        "aria-hidden": "true",
        inert: "",
      });
    default:
      return assertNeverContentLayoutAvailability(state.availability);
  }
}

function createProjectedAttributes(
  state: DirectChildContentLayoutState,
): ContentLayoutProjectionDomAttributes {
  return Object.freeze({
    [CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.accessibility]: state.accessibility,
    [CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.availability]: state.availability,
    [CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.geometry]: state.layoutParticipation,
    [CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.interaction]: state.interaction,
    [CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.slot]: "shared",
  });
}

function assertNeverContentLayoutAvailability(value: never): never {
  void value;
  throw new Error("Unsupported content layout projection availability");
}
