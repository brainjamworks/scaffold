import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { audioBlockDefinition } from "./audio-block-definition";
import { createAudioBlockNode } from "./audio-block-node";

import "./AudioBlock.css";

function AudioBlockAuthoringFallback() {
  return <div aria-hidden="true" className="sc-audio-block__fallback" />;
}

export const AudioBlockAuthoringExtension = createAudioBlockNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      definition: audioBlockDefinition,
      view: {
        fallback: AudioBlockAuthoringFallback,
        load: async () => {
          const mod = await import("./AudioBlockAuthoringView");
          return { default: mod.AudioBlockAuthoringView };
        },
      },
      className: "sc-audio-block",
    }),
});
