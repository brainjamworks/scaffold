import { type NodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import { useLearningEventReporter } from "@/runtime/learning-events/LearningEventRuntimeProvider";

import { parseAudioBlockData, useResolvedAudioBlockSource } from "./AudioBlockModel";
import { AudioBlockSurface } from "./AudioBlockSurface";
import { useAudioControlBinding } from "./audio-control-binding";
import { createAudioLearningEventConsumer } from "./audio-learning-event-translation";
import { createAudioRuntimeController } from "./audio-runtime-controller";

export function AudioBlockRuntimeView(props: NodeViewProps) {
  const mediaPort = useMediaPort();
  const data = parseAudioBlockData(props.node.attrs["data"]);
  const { errorMessage, resolvedUrl } = useResolvedAudioBlockSource(data, mediaPort);
  const learningEventReporter = useLearningEventReporter();
  const resourceId = props.node.attrs["id"];
  const [controller] = useState(() => createAudioRuntimeController());
  const [authorityMounted, setAuthorityMounted] = useState(false);
  const handleAuthorityMountedChange = useCallback((mounted: boolean) => {
    setAuthorityMounted(mounted);
  }, []);
  useAudioControlBinding({
    controller,
    editor: props.editor,
    enabled: authorityMounted && resolvedUrl !== null && errorMessage === null,
    getPos: props.getPos,
    node: props.node,
    ownerId: resourceId,
  });
  useEffect(() => {
    if (typeof resourceId !== "string" || !resourceId.trim()) return;
    return controller.subscribeToCommits(
      createAudioLearningEventConsumer({
        report: (input) => learningEventReporter.report(input),
        resourceId,
      }),
    );
  }, [controller, learningEventReporter, resourceId]);

  return (
    <AudioBlockSurface
      data={data}
      controller={controller}
      errorMessage={errorMessage}
      onAuthorityMountedChange={handleAuthorityMountedChange}
      resolvedUrl={resolvedUrl}
    />
  );
}
