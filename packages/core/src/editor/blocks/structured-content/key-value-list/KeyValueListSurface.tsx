import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import type { ReactNode } from "react";
import { KeyValueListDataSchema } from "@scaffold/contracts";

import { emptyKeyValueListData } from "./content";
import "./KeyValueList.css";

interface KeyValueListSurfaceProps {
  node: NodeViewProps["node"];
  trailing?: ReactNode;
}

export function KeyValueListSurface({ node, trailing }: KeyValueListSurfaceProps) {
  const parsed = KeyValueListDataSchema.safeParse(node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyKeyValueListData();

  return (
    <div
      data-node="key-value-list"
      data-layout={data.layout}
      data-key-width={data.keyWidth}
      className="sc-key-value-list"
    >
      <div className="sc-key-value-list__rows">
        <NodeViewContent className="sc-key-value-list__content" />
      </div>
      {trailing}
    </div>
  );
}
