import { useEditorState, type NodeViewProps } from "@tiptap/react";

import { readEmbedData, updateEmbedDataUrl } from "./embed-data";
import { EmbedSurface } from "./EmbedSurface";

export function EmbedAuthoringView(props: NodeViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const data = readEmbedData(props.node.attrs["data"]);

  return (
    <EmbedSurface
      data={data}
      editable={editable}
      onSubmit={(url) => {
        props.updateAttributes({
          data: updateEmbedDataUrl(data, url),
        });
      }}
    />
  );
}
