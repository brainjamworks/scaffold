import { AUTHORING_FRAME_WRAPPER_ATTR } from "../../interactions/dom/authoring-chrome";
import {
  BOUNDED_PLACEMENT_ATTR,
  boundedPlacementAttributes,
  type BoundedPlacement,
} from "../model/bounded-placement";

export function applyReactNodeViewElementDefaults(element: HTMLElement): void {
  element.style.display = "block";
  element.style.boxSizing = "border-box";
  element.style.width = "100%";
  element.style.maxWidth = "100%";
  element.style.minWidth = "0";
}

export function applyResizableNodeViewDomDefaults(input: {
  boundedPlacement?: BoundedPlacement;
  dom: HTMLElement;
  wrapper: HTMLElement;
}): void {
  const boundedAttributes = boundedPlacementAttributes(input.boundedPlacement);
  input.dom.style.width = "100%";
  input.dom.style.maxWidth = "100%";
  input.dom.style.minWidth = "0";
  input.dom.style.display = "block";
  input.dom.removeAttribute(BOUNDED_PLACEMENT_ATTR);
  input.wrapper.removeAttribute(BOUNDED_PLACEMENT_ATTR);
  for (const [name, value] of Object.entries(boundedAttributes)) {
    input.dom.setAttribute(name, value);
    input.wrapper.setAttribute(name, value);
  }
  input.wrapper.setAttribute(AUTHORING_FRAME_WRAPPER_ATTR, "");
  input.wrapper.classList.add("@container");
  input.wrapper.style.boxSizing = "border-box";
  input.wrapper.style.maxWidth = "100%";
  input.wrapper.style.minWidth = "0";
}
