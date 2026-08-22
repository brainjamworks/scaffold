import { NodeViewContent } from "@tiptap/react";
import type { ReactNode } from "react";

import "./Glossary.css";

interface GlossarySurfaceProps {
  trailing?: ReactNode;
}

export function GlossarySurface({ trailing }: GlossarySurfaceProps) {
  return (
    <section data-node="glossary" className="sc-course-glossary__section" aria-label="Glossary">
      <NodeViewContent<"div"> as="div" role="list" className="sc-course-glossary__list" />
      {trailing}
    </section>
  );
}
