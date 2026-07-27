import { type NodeViewProps } from "@tiptap/react";
import { useRef } from "react";

import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import {
  buildResourceAttemptedStatementDraft,
  buildResourceCompletedStatementDraft,
  useXapiSession,
  type XapiSession,
} from "@/runtime/xapi";

import { parseAudioBlockData, useResolvedAudioBlockSource } from "./AudioBlockModel";
import { AudioBlockSurface } from "./AudioBlockSurface";

export function AudioBlockRuntimeView(props: NodeViewProps) {
  const mediaPort = useMediaPort();
  const data = parseAudioBlockData(props.node.attrs["data"]);
  const { errorMessage, resolvedUrl } = useResolvedAudioBlockSource(data, mediaPort);
  const xapiSession = useXapiSession();
  const resourceId = props.node.attrs["id"];
  const recordedRef = useRef<{
    session: XapiSession;
    resourceId: string;
    attempted: boolean;
    completed: boolean;
  } | null>(null);
  const getRecorded = () => {
    if (!xapiSession || typeof resourceId !== "string" || !resourceId.trim()) return null;
    let recorded = recordedRef.current;
    if (recorded?.session !== xapiSession || recorded.resourceId !== resourceId) {
      recorded = {
        session: xapiSession,
        resourceId,
        attempted: false,
        completed: false,
      };
      recordedRef.current = recorded;
    }
    return recorded;
  };
  const recordAttempted = () => {
    const recorded = getRecorded();
    if (!recorded || recorded.attempted) return;
    try {
      recorded.session.record(
        buildResourceAttemptedStatementDraft({
          rootActivityId: recorded.session.rootActivityId,
          resourceId: recorded.resourceId,
          resourceKind: "audio",
        }),
      );
      recorded.attempted = true;
    } catch {
      // Audio recording is observational and cannot change playback.
    }
  };
  const recordCompleted = () => {
    const recorded = getRecorded();
    if (!recorded || recorded.completed) return;
    try {
      recorded.session.record(
        buildResourceCompletedStatementDraft({
          rootActivityId: recorded.session.rootActivityId,
          resourceId: recorded.resourceId,
          resourceKind: "audio",
        }),
      );
      recorded.completed = true;
    } catch {
      // Audio recording is observational and cannot change playback.
    }
  };

  return (
    <AudioBlockSurface
      data={data}
      errorMessage={errorMessage}
      onPlaybackEnded={recordCompleted}
      onPlaybackStarted={recordAttempted}
      resolvedUrl={resolvedUrl}
      withWrapper={false}
    />
  );
}
