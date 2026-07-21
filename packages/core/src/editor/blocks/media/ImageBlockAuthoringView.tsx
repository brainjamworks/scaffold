import { type NodeViewProps } from "@tiptap/react";

import { MediaEmptyAction } from "@/editor/media/authoring/shared-components/MediaEmptyAction";
import { MediaReplaceButton } from "@/editor/media/authoring/shared-components/MediaReplaceButton";
import {
  nodeViewUiKey,
  usePickerOpen,
} from "@/editor/media/authoring/picker/file-picker-open-state";
import { type ImageBlockAttrs } from "@scaffold/contracts";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";

import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";
import { parseImageBlockData, useResolvedImageBlockSource } from "./ImageBlockModel";
import { ImageBlockSurface } from "./ImageBlockSurface";

function applyImagePickerResult(result: FilePickerResult): ImageBlockAttrs | null {
  if (result.source === "upload" && result.upload) {
    return {
      mode: "managed",
      mediaId: result.upload.id,
      ...(result.alt ? { alt: result.alt } : {}),
    };
  }
  if (result.source === "browse" && result.browse) {
    return {
      mode: "managed",
      mediaId: result.browse.id,
      ...(result.alt ? { alt: result.alt } : {}),
    };
  }
  if (result.source === "url" && result.url) {
    return {
      mode: "external",
      src: result.url,
      ...(result.alt ? { alt: result.alt } : {}),
    };
  }
  return null;
}

export function ImageBlockAuthoringView(props: NodeViewProps) {
  const mediaPort = useMediaPort();
  const data = parseImageBlockData(props.node.attrs["data"]);
  const pickerKey = nodeViewUiKey({
    owner: "image-block",
    surface: "file-picker",
    id: props.node.attrs["id"],
  });
  const [open, setOpen] = usePickerOpen(pickerKey);
  const { errorMessage, resolvedUrl } = useResolvedImageBlockSource(data, mediaPort);

  const handlePickerResolved = (result: FilePickerResult) => {
    const next = applyImagePickerResult(result);
    if (next) props.updateAttributes({ data: next });
  };

  return (
    <ImageBlockSurface
      data={data}
      errorMessage={errorMessage}
      resolvedUrl={resolvedUrl}
      withWrapper={false}
      emptyAction={
        <MediaEmptyAction
          onClick={() => setOpen(true)}
          aria-label="Add image"
          label="Add image"
          className="sc-image-block__empty-action"
        />
      }
      replaceAction={
        resolvedUrl ? (
          <MediaReplaceButton onClick={() => setOpen(true)} aria-label="Replace image" />
        ) : null
      }
    >
      <FilePickerModal
        open={open}
        onOpenChange={setOpen}
        kind="media"
        defaultMediaType="image"
        title={data ? "Replace image" : "Add image"}
        onResolved={handlePickerResolved}
      />
    </ImageBlockSurface>
  );
}
