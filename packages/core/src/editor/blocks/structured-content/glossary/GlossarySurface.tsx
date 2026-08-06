import { NodeViewContent } from "@tiptap/react";
import type { ReactNode } from "react";

import "./Glossary.css";

interface GlossarySurfaceProps {
  trailing?: ReactNode;
}

export function GlossarySurface({ trailing }: GlossarySurfaceProps) {
  return (
    <section data-node="glossary" className="sc-course-glossary__section" aria-label="Glossary">
      <NodeViewContent<"dl"> as="dl" className="sc-course-glossary__list" />
      {trailing}
    </section>
  );
}
