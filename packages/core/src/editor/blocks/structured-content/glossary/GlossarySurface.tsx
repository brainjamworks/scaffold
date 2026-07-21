import { NodeViewContent } from "@tiptap/react";
import type { ReactNode } from "react";

import "./Glossary.css";

interface GlossarySurfaceProps {
  trailing?: ReactNode;
}

export function GlossarySurface({ trailing }: GlossarySurfaceProps) {
  return (
    <div data-node="glossary" className="sc-glossary">
      <section className="sc-glossary__section" aria-label="Glossary">
        <div className="sc-glossary__list">
          <NodeViewContent />
          {trailing}
        </div>
      </section>
    </div>
  );
}
