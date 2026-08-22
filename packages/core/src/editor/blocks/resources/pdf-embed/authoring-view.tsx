import { FilePdfIcon as FilePdf } from "@phosphor-icons/react";
import { useEditorState, type NodeViewProps } from "@tiptap/react";
import { PdfEmbedDataSchema, type PdfEmbedData, type PdfEmbedSource } from "@scaffold/contracts";

import { nodeViewUiStateKey, useNodeViewOpenState } from "@/editor/prosemirror/node-view-ui-state";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import { MediaEmptyAction } from "@/ui/components/app/MediaEmptyAction/MediaEmptyAction";
import { MediaReplaceButton } from "@/ui/components/app/MediaReplaceButton/MediaReplaceButton";
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

  const pickerKey = nodeViewUiStateKey({
    owner: "pdf-embed",
    surface: "file-picker",
    id: props.node.attrs["id"],
  });
  const [pickerOpen, setPickerOpen] = useNodeViewOpenState(pickerKey);

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
        mediaPort={mediaPort}
        emptyAction={
          editable ? (
            <MediaEmptyAction
              aria-label="Add PDF"
              icon={<FilePdf size={24} weight="regular" />}
              label="Add PDF"
              onClick={() => setPickerOpen(true)}
              onMouseDown={(event) => event.stopPropagation()}
            />
          ) : undefined
        }
        replaceAction={
          editable && data.source ? (
            <MediaReplaceButton
              aria-label="Replace PDF"
              onClick={() => setPickerOpen(true)}
              placement="inline"
              tooltip="Replace PDF"
            />
          ) : undefined
        }
      />
      {editable ? (
        <FilePickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          kind="documents"
          allowedMediaTypes={["pdf"]}
          defaultMediaType="pdf"
          title={data.source ? "Replace PDF" : "Add PDF"}
          onResolved={handlePickerResolved}
          allowExternalUrl
        />
      ) : null}
    </>
  );
}
