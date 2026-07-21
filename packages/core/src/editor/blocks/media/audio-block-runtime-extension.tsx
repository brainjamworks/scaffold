import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { audioBlockDefinition } from "./audio-block-definition";
import { createAudioBlockNode } from "./audio-block-node";

import "./AudioBlock.css";

function AudioBlockRuntimeFallback() {
  return <div aria-hidden="true" className="sc-audio-block__fallback" />;
}

export const AudioBlockRuntimeExtension = createAudioBlockNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      definition: audioBlockDefinition,
      view: {
        fallback: AudioBlockRuntimeFallback,
        load: async () => {
          const mod = await import("./audio-block-runtime-view");
          return { default: mod.AudioBlockRuntimeView };
        },
      },
      className: "sc-audio-block",
    }),
});
