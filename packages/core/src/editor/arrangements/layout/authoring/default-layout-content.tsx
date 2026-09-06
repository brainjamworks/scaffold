import { NodeViewContent } from "@tiptap/react";

import { LayoutAddGhost } from "./layout-chrome";
import type { LayoutComponentProps, SectionComponentProps } from "./layout-view-definition";

type DefaultLayoutContentProps = Pick<
  LayoutComponentProps,
  "definition" | "editable" | "editor" | "getPos" | "node"
>;

type DefaultSectionContentProps = Pick<
  SectionComponentProps,
  "editable" | "isEmpty" | "layoutDefinition" | "layoutNode" | "node"
>;

export function DefaultLayoutContent({
  definition,
  editable,
  editor,
  getPos,
  node,
}: DefaultLayoutContentProps) {
  return (
    <>
      <NodeViewContent className="sc-layout-authoring__content" />
      {editable && definition?.section ? (
        <LayoutAddGhost
          editor={editor}
          getPos={getPos}
          label={definition.section.addLabel}
          layoutId={node.attrs["id"]}
          className="sc-layout-add-ghost--default"
        />
      ) : null}
    </>
  );
}

export function DefaultSectionContent(_props: DefaultSectionContentProps) {
  return (
    <NodeViewContent className="sc-layout-section__content sc-layout-section-authoring__content" />
  );
}
