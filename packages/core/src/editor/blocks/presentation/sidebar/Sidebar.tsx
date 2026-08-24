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
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

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
      <NodeViewContent className="sc-course-sidebar__slots" />
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
    <aside className="sc-course-sidebar__surface">
      <div className="sc-course-sidebar__layout">
        <div className="sc-course-sidebar__icon-slot">
          <SidebarIcon
            editable={editable}
            icon={icon}
            onIconChange={onIconChange}
            {...(renderIconControl ? { renderIconControl } : {})}
          />
        </div>
        {children}
      </div>
    </aside>
  );
}

export function SidebarLabelView() {
  return (
    <NodeViewWrapper data-slot="sidebar-label" className="sc-course-sidebar__label">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export function SidebarTitleView(props: NodeViewProps) {
  return (
    <NodeViewWrapper
      data-slot="sidebar-title"
      role="heading"
      aria-level={resolveHeadingLevel(props)}
      className="sc-course-sidebar__title"
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

function resolveHeadingLevel(props: NodeViewProps): 2 | 3 | 4 | 5 {
  const pos = props.getPos();
  if (!isValidEditorDocPos(props.editor, pos)) return 2;
  const $pos = props.editor.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const parent = $pos.node(depth);
    if (parent.type.name === "sidebar") {
      return parseSidebarData(parent.attrs["data"]).headingLevel;
    }
  }
  return 2;
}

export function SidebarBodyView() {
  return (
    <NodeViewWrapper data-slot="sidebar-body" className="sc-course-sidebar__body">
      <div className="sc-course-sidebar__body-content">
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
    <span aria-hidden className="sc-course-sidebar__icon-chip">
      <IconRenderer
        value={icon}
        fallbackValue={SIDEBAR_ICON_FALLBACK}
        className="sc-course-sidebar__icon-glyph"
      />
    </span>
  );
}
