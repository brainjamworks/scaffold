import { SidebarDataSchema, type SidebarData } from "@scaffold/contracts";
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import type { ReactNode } from "react";

import { IconRenderer } from "@/ui/icons/IconRenderer";
import { catalogIconValue, type IconValue } from "@/schemas/media/icon";

import { emptySidebarData } from "./content";

import "./Sidebar.css";

const SIDEBAR_ICON_FALLBACK = catalogIconValue("file-text");

export interface SidebarIconControlProps {
  fallbackValue: IconValue;
  value: IconValue | null;
  onValueChange: (icon: IconValue | null) => void;
}

export type SidebarIconControlRenderer = (props: SidebarIconControlProps) => ReactNode;

export interface SidebarViewProps extends NodeViewProps {
  renderIconControl?: SidebarIconControlRenderer;
}

export function SidebarView(props: SidebarViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const data = parseSidebarData(props.node.attrs["data"]);
  const updateData = (patch: Partial<SidebarData>) => {
    props.updateAttributes({
      data: SidebarDataSchema.parse({ ...data, ...patch }),
    });
  };

  return (
    <Sidebar
      editable={editable}
      icon={data.icon}
      onIconChange={(icon) => updateData({ icon })}
      {...(props.renderIconControl ? { renderIconControl: props.renderIconControl } : {})}
    >
      <NodeViewContent className="sc-sidebar__slots" />
    </Sidebar>
  );
}

export function Sidebar({
  children,
  editable,
  icon,
  onIconChange,
  renderIconControl,
}: {
  children: ReactNode;
  editable: boolean;
  icon: IconValue | null;
  onIconChange: (icon: IconValue | null) => void;
  renderIconControl?: SidebarIconControlRenderer;
}) {
  return (
    <aside className="sc-sidebar__card">
      <div className="sc-sidebar__grid">
        <SidebarIcon
          editable={editable}
          icon={icon}
          onIconChange={onIconChange}
          {...(renderIconControl ? { renderIconControl } : {})}
        />
        {children}
      </div>
    </aside>
  );
}

export function SidebarLabelView() {
  return (
    <NodeViewWrapper data-slot="sidebar-label" className="sc-sidebar__label">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export function SidebarTitleView() {
  return (
    <NodeViewWrapper
      data-slot="sidebar-title"
      role="heading"
      aria-level={4}
      className="sc-sidebar__title"
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export function SidebarBodyView() {
  return (
    <NodeViewWrapper data-slot="sidebar-body" className="sc-sidebar__body">
      <div className="sc-sidebar__body-content">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
}

function parseSidebarData(value: unknown): SidebarData {
  const parsed = SidebarDataSchema.safeParse(value);
  return parsed.success ? parsed.data : emptySidebarData();
}

function SidebarIcon({
  editable,
  icon,
  onIconChange,
  renderIconControl,
}: {
  editable: boolean;
  icon: IconValue | null;
  onIconChange: (icon: IconValue | null) => void;
  renderIconControl?: SidebarIconControlRenderer;
}) {
  if (editable && renderIconControl) {
    return renderIconControl({
      fallbackValue: SIDEBAR_ICON_FALLBACK,
      value: icon,
      onValueChange: onIconChange,
    });
  }

  return (
    <span aria-hidden className="sc-sidebar__icon">
      <IconRenderer
        value={icon}
        fallbackValue={SIDEBAR_ICON_FALLBACK}
        className="sc-sidebar__icon-glyph"
      />
    </span>
  );
}
