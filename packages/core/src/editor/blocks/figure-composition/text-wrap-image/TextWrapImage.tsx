import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import type { TextWrapImageData, TextWrapImageSource } from "@scaffold/contracts";
import type { MouseEvent as ReactMouseEvent } from "react";

import {
  nodeViewUiKey,
  usePickerOpen,
} from "@/editor/media/authoring/picker/file-picker-open-state";
import { MediaEmptyAction } from "@/editor/media/authoring/shared-components/MediaEmptyAction";
import { MediaReplaceButton } from "@/editor/media/authoring/shared-components/MediaReplaceButton";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";
import {
  normalizeTextWrapImageData,
  parseTextWrapImageData,
  useResolvedTextWrapImageSource,
} from "./TextWrapImageModel";
import { TextWrapImageMediaSurface } from "./TextWrapImageSurface";

import "./TextWrapImage.css";

function pickerResultToSource(result: FilePickerResult): TextWrapImageSource {
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

export function TextWrapImageAuthoringView(props: NodeViewProps) {
  const mediaPort = useMediaPort();
  const data = parseTextWrapImageData(props.node.attrs["data"]);

  const updateData = (patch: Partial<TextWrapImageData>) => {
    props.updateAttributes({
      data: normalizeTextWrapImageData({ ...data, ...patch }),
    });
  };

  const pickerKey = nodeViewUiKey({
    owner: "text-wrap-image",
    surface: "file-picker",
    id: props.node.attrs["id"],
  });
  const [pickerOpen, setPickerOpen] = usePickerOpen(pickerKey);
  const { errorMessage, resolvedUrl } = useResolvedTextWrapImageSource(data, mediaPort);

  const handlePickerResolved = (result: FilePickerResult) => {
    const next = pickerResultToSource(result);
    updateData({
      source: next,
      ...(result.alt ? { alt: result.alt } : {}),
    });
  };

  const openPicker = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setPickerOpen(true);
  };

  return (
    <>
      <div
        className="sc-text-wrap-image__shell"
        data-position={data.position}
        data-size={data.size}
        data-shape={data.shape}
      >
        <TextWrapImageMediaSurface
          data={data}
          emptyAction={
            <MediaEmptyAction
              onClick={openPicker}
              aria-label="Add wrapped image"
              label="Add image"
              className="sc-text-wrap-image__empty"
            />
          }
          errorMessage={errorMessage}
          fileUrl={resolvedUrl}
          replaceAction={
            <MediaReplaceButton onClick={openPicker} aria-label="Replace wrapped image" />
          }
        />
        <NodeViewContent className="sc-text-wrap-image__content" />
      </div>
      {/* Keep the picker mounted from this NodeView so usePickerOpen
       * can survive ProseMirror remounts during block selection. */}
      <FilePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="media"
        defaultMediaType="image"
        title={data.source ? "Replace image" : "Add image"}
        onResolved={handlePickerResolved}
      />
    </>
  );
}
