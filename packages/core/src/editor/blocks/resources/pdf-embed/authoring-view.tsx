import { useEditorState, type NodeViewProps } from "@tiptap/react";
import { PdfEmbedDataSchema, type PdfEmbedData, type PdfEmbedSource } from "@scaffold/contracts";

import {
  nodeViewUiKey,
  usePickerOpen,
} from "@/editor/media/authoring/picker/file-picker-open-state";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";
import { emptyPdfEmbedData } from "./content";
import { PdfEmbedSurface } from "./PdfEmbedSurface";

function normalizeData(next: Partial<PdfEmbedData>): PdfEmbedData {
  return PdfEmbedDataSchema.parse(next);
}

function pickerResultToSource(result: FilePickerResult): PdfEmbedSource {
  if (result.source === "upload" && result.upload) {
    return { mode: "managed", mediaId: result.upload.id };
  }
  if (result.source === "browse" && result.browse) {
    return { mode: "managed", mediaId: result.browse.id };
  }
  if (result.source === "url" && result.url) {
    return { mode: "external", src: result.url };
  }
  return null;
}

export function PdfEmbedAuthoringView(props: NodeViewProps) {
  const mediaPort = useMediaPort();
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const parsed = PdfEmbedDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyPdfEmbedData();

  const updateData = (patch: Partial<PdfEmbedData>) => {
    props.updateAttributes({ data: normalizeData({ ...data, ...patch }) });
  };

  const pickerKey = nodeViewUiKey({
    owner: "pdf-embed",
    surface: "file-picker",
    id: props.node.attrs["id"],
  });
  const [pickerOpen, setPickerOpen] = usePickerOpen(pickerKey);

  const handlePickerResolved = (result: FilePickerResult) => {
    const next = pickerResultToSource(result);
    updateData({
      source: next,
      ...(result.title ? { title: result.title } : {}),
    });
  };

  return (
    <>
      <PdfEmbedSurface
        data={data}
        editable={editable}
        mediaPort={mediaPort}
        onAdd={() => setPickerOpen(true)}
      />
      {editable ? (
        <FilePickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          kind="documents"
          defaultMediaType="pdf"
          title={data.source ? "Replace PDF" : "Add PDF"}
          onResolved={handlePickerResolved}
          allowExternalUrl
        />
      ) : null}
    </>
  );
}
