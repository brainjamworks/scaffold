import { type NodeViewProps } from "@tiptap/react";
import { SpeakerHighIcon as Speaker } from "@phosphor-icons/react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { MediaEmptyAction } from "@/ui/components/app/MediaEmptyAction/MediaEmptyAction";
import { MediaReplaceButton } from "@/ui/components/app/MediaReplaceButton/MediaReplaceButton";
import { nodeViewUiStateKey, useNodeViewOpenState } from "@/editor/prosemirror/node-view-ui-state";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import { selectNodeAt } from "@/editor/selection/selection-commands";
import { type AudioBlockAttrs } from "@scaffold/contracts";
import { authoringMovementSnapshotChromeAttributes } from "@/editor/movement/view/authoring-movement-presentation";

import { parseAudioBlockData, useResolvedAudioBlockSource } from "./AudioBlockModel";
import { AudioBlockSurface } from "./AudioBlockSurface";
import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";

import "./AudioBlockAuthoringControls.css";

function applyAudioPickerResult(result: FilePickerResult): AudioBlockAttrs | null {
  if (result.source === "upload" && result.upload) {
    return {
      mode: "managed",
      mediaId: result.upload.id,
      ...(result.title ? { title: result.title } : {}),
    };
  }
  if (result.source === "browse" && result.browse) {
    return {
      mode: "managed",
      mediaId: result.browse.id,
      ...(result.title ? { title: result.title } : {}),
    };
  }
  if (result.source === "url" && result.url) {
    return {
      mode: "external",
      src: result.url,
      ...(result.title ? { title: result.title } : {}),
    };
  }
  return null;
}

export function AudioBlockAuthoringView(props: NodeViewProps) {
  const mediaPort = useMediaPort();
  const data = parseAudioBlockData(props.node.attrs["data"]);
  const pickerKey = nodeViewUiStateKey({
    owner: "audio-block",
    surface: "file-picker",
    id: props.node.attrs["id"],
  });
  const [pickerOpen, setPickerOpen] = useNodeViewOpenState(pickerKey);
  const { errorMessage, resolvedUrl } = useResolvedAudioBlockSource(data, mediaPort);

  const handlePickerResolved = (result: FilePickerResult) => {
    const next = applyAudioPickerResult(result);
    if (next) props.updateAttributes({ data: next });
  };

  const openPicker = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setPickerOpen(true);
  };

  const selectAudioBlock = (event: ReactMouseEvent) => {
    if (event.button !== 0 || event.defaultPrevented) return;
    const pos = props.getPos();
    if (typeof pos !== "number") return;

    selectNodeAt(props.editor, pos, {
      focus: true,
      scrollIntoView: false,
    });
  };

  return (
    <>
      <div
        className="sc-app-audio-block"
        contentEditable={false}
        onMouseDownCapture={selectAudioBlock}
      >
        {!data ? (
          <MediaEmptyAction
            {...authoringMovementSnapshotChromeAttributes()}
            aria-label="Add audio"
            className="sc-app-audio-block__empty-action"
            icon={<Speaker size={24} weight="regular" />}
            label="Add audio"
            onClick={openPicker}
          />
        ) : (
          <div className="sc-app-audio-block__populated-media">
            <div className="sc-app-audio-block__course-cell">
              <AudioBlockSurface
                data={data}
                errorMessage={errorMessage}
                resolvedUrl={resolvedUrl}
              />
            </div>
            <div className="sc-app-audio-block__replace-rail">
              <MediaReplaceButton
                {...authoringMovementSnapshotChromeAttributes()}
                aria-label="Replace audio"
                onClick={openPicker}
                placement="inline"
                tooltip="Replace audio"
              />
            </div>
          </div>
        )}
      </div>
      <FilePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="media"
        allowedMediaTypes={["audio"]}
        defaultMediaType="audio"
        title={data ? "Replace audio" : "Add audio"}
        metadataFields={["title"]}
        onResolved={handlePickerResolved}
      />
    </>
  );
}
