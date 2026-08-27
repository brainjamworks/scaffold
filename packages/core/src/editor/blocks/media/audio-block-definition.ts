import { SpeakerHighIcon as Speaker } from "@phosphor-icons/react";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";
import { MEDIA_ACCESSIBILITY_COPY } from "@/editor/media/accessibility/media-accessibility";
import { AudioBlockAttrsSchema } from "@scaffold/contracts";

import { applyAudioAccessibilitySettings } from "./media-settings";

export const AUDIO_BLOCK_ID = "audio";

const audioBlockConfiguration = defineConfiguration({
  attr: "data",
  schema: AudioBlockAttrsSchema.nullable(),
  apply: applyAudioAccessibilitySettings,
  sheet: {
    title: "Audio settings",
    defaultOpenSections: ["accessibility"],
    sections: [{ id: "accessibility", title: "Accessibility" }],
  },
  controls: [
    {
      kind: "text",
      name: "title",
      label: MEDIA_ACCESSIBILITY_COPY.title.label,
      description: MEDIA_ACCESSIBILITY_COPY.title.audioDescription,
      placeholder: MEDIA_ACCESSIBILITY_COPY.title.audioPlaceholder,
      placement: { sheet: { section: "accessibility" } },
    },
  ],
});

export const audioBlockDefinition = defineBlock({
  nodeType: "audio_block",
  title: "Audio",
  control: {
    owner: {
      events: [
        { type: "played", label: "Played" },
        { type: "paused", label: "Paused" },
        { type: "ended", label: "Ended" },
      ],
      states: [
        {
          key: "status",
          label: "Status",
          valueType: {
            kind: "enum",
            options: [
              { value: "idle", label: "Idle" },
              { value: "playing", label: "Playing" },
              { value: "paused", label: "Paused" },
              { value: "ended", label: "Ended" },
            ],
          },
        },
      ],
      commands: [
        { type: "play", label: "Play" },
        { type: "pause", label: "Pause" },
        {
          type: "seek-to",
          label: "Seek to",
          input: { kind: "runtime-bounded-number", min: 0, unitLabel: "seconds" },
        },
      ],
    },
  },
  configuration: audioBlockConfiguration,
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: AUDIO_BLOCK_ID,
    category: "media",
    title: "Audio",
    description: "Upload or link an audio clip",
    icon: Speaker,
    keywords: ["audio", "sound", "clip", "media"],
    content: () => ({
      type: "audio_block",
      attrs: { id: createEmbeddedNodeId(), data: null },
    }),
  },
});
