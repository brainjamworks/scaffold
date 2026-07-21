import { NodeViewContent, useEditorState, type NodeViewProps } from "@tiptap/react";
import {
  ResourceLinkDataSchema,
  type ResourceLinkData,
  type ResourceLinkKind,
} from "@scaffold/contracts";
import { useId } from "react";

import { cn } from "@/lib/cn";

import { emptyResourceLinkData } from "./content";
import { RESOURCE_LINK_KIND_LABELS } from "./resource-link-presentation";
import { RESOURCE_LINK_KIND_ICONS, ResourceLinkSurface } from "./ResourceLinkSurface";

function normalizeData(next: Partial<ResourceLinkData>): ResourceLinkData {
  return ResourceLinkDataSchema.parse(next);
}

export function ResourceLinkAuthoringView(props: NodeViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const parsed = ResourceLinkDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyResourceLinkData();
  const urlInputId = useId();

  const updateData = (patch: Partial<ResourceLinkData>) => {
    props.updateAttributes({ data: normalizeData({ ...data, ...patch }) });
  };

  return (
    <ResourceLinkSurface
      data={data}
      editable={editable}
      controls={
        editable ? (
          <ResourceLinkAuthoringControls
            data={data}
            urlInputId={urlInputId}
            onUpdate={updateData}
          />
        ) : null
      }
    >
      <NodeViewContent />
    </ResourceLinkSurface>
  );
}

function ResourceLinkAuthoringControls({
  data,
  onUpdate,
  urlInputId,
}: {
  data: ResourceLinkData;
  onUpdate: (patch: Partial<ResourceLinkData>) => void;
  urlInputId: string;
}) {
  return (
    <div
      contentEditable={false}
      className="sc-resource-link__controls"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <label htmlFor={urlInputId} className="sc-sr-only">
        Resource URL
      </label>
      <input
        id={urlInputId}
        type="url"
        value={data.url}
        placeholder="https://..."
        onChange={(event) => onUpdate({ url: event.target.value })}
        onMouseDown={(event) => event.stopPropagation()}
        className="sc-resource-link__url-input"
      />
      <KindPicker value={data.kind} onChange={(kind) => onUpdate({ kind })} />
    </div>
  );
}

function KindPicker({
  value,
  onChange,
}: {
  value: ResourceLinkKind;
  onChange: (kind: ResourceLinkKind) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Resource kind" className="sc-resource-link__kind-picker">
      {(Object.keys(RESOURCE_LINK_KIND_LABELS) as ResourceLinkKind[]).map((kind) => {
        const Icon = RESOURCE_LINK_KIND_ICONS[kind];
        const selected = value === kind;
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={RESOURCE_LINK_KIND_LABELS[kind]}
            title={RESOURCE_LINK_KIND_LABELS[kind]}
            onClick={() => onChange(kind)}
            onMouseDown={(event) => event.preventDefault()}
            className={cn(
              selected
                ? "sc-resource-link__kind-button sc-resource-link__kind-button--selected"
                : "sc-resource-link__kind-button sc-resource-link__kind-button--idle",
            )}
          >
            <Icon size={14} weight={selected ? "fill" : "regular"} />
          </button>
        );
      })}
    </div>
  );
}
