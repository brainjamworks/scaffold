import { NodeViewContent } from "@tiptap/react";

import type {
  LayoutRuntimeViewProps,
  SectionRuntimeFrameOptions,
  SectionRuntimeViewProps,
} from "../runtime/layout-view-definition";
import {
  AccordionLayoutShell,
  AccordionSectionFrame,
  readAccordionOptions,
} from "./accordion-components";

import "./accordion.css";

export function AccordionLayoutRuntimeView(props: LayoutRuntimeViewProps) {
  const options = readAccordionOptions(props.node.attrs["options"]);

  return (
    <div className="sc-accordion-layout">
      <AccordionLayoutShell options={options}>
        <NodeViewContent className="sc-accordion-layout__content" />
      </AccordionLayoutShell>
    </div>
  );
}

export function AccordionSectionRuntimeView(_props: SectionRuntimeViewProps) {
  return (
    <AccordionSectionFrame>
      <NodeViewContent className="sc-accordion-section__content" />
    </AccordionSectionFrame>
  );
}

export function accordionRuntimeSectionFrame(
  _props: SectionRuntimeViewProps,
): SectionRuntimeFrameOptions {
  return {
    className: "sc-accordion-section",
  };
}
