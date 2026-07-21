import { type NodeViewProps } from "@tiptap/react";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  SpeakerHighIcon as Speaker,
} from "@phosphor-icons/react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";
import {
  nodeViewUiKey,
  usePickerOpen,
} from "@/editor/media/authoring/picker/file-picker-open-state";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import { selectNodeAt } from "@/editor/selection/selection-commands";
import { type AudioBlockAttrs } from "@scaffold/contracts";

import { parseAudioBlockData, useResolvedAudioBlockSource } from "./AudioBlockModel";
import { AudioBlockSurface } from "./AudioBlockSurface";
import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";

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
  const pickerKey = nodeViewUiKey({
    owner: "audio-block",
    surface: "file-picker",
    id: props.node.attrs["id"],
  });
  const [pickerOpen, setPickerOpen] = usePickerOpen(pickerKey);
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
    <AudioBlockSurface
      data={data}
      emptyAction={
        <BlockAddGhost
          label="Add audio"
          presentation="pill"
          icon={<Speaker size={18} weight="regular" aria-hidden />}
          onClick={openPicker}
          contentEditable={false}
          className="sc-audio-block__ghost"
        />
      }
      errorMessage={errorMessage}
      onMouseDownCapture={selectAudioBlock}
      replaceAction={
        data ? (
          <button
            type="button"
            onClick={openPicker}
            aria-label="Replace audio"
            className="sc-audio-block__replace"
          >
            <ArrowsClockwise size={12} weight="bold" aria-hidden />
            <span>Replace</span>
          </button>
        ) : null
      }
      resolvedUrl={resolvedUrl}
      withWrapper={false}
    >
      <FilePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="media"
        defaultMediaType="audio"
        title={data ? "Replace audio" : "Add audio"}
        metadataFields={["title"]}
        onResolved={handlePickerResolved}
      />
    </AudioBlockSurface>
  );
}
