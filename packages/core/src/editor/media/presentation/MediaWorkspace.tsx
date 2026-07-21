import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type LiHTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import { WorkspaceDialog } from "@/ui/components/WorkspaceDialog/WorkspaceDialog";

import "./MediaWorkspace.css";

interface MediaWorkspaceRootProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function Root({ children, className, ...rest }: MediaWorkspaceRootProps) {
  return (
    <WorkspaceDialog.Body {...rest} className={cn("sc-media-workspace", className)}>
      <div className="sc-media-workspace__layout">{children}</div>
    </WorkspaceDialog.Body>
  );
}

interface MediaWorkspaceCanvasProps extends HTMLAttributes<HTMLDivElement> {
  "aria-label": string;
}

const Canvas = forwardRef<HTMLDivElement, MediaWorkspaceCanvasProps>(function Canvas(
  { className, ...rest },
  ref,
) {
  return (
    <div
      {...rest}
      ref={ref}
      className={cn("sc-media-workspace__canvas", className)}
      role="region"
    />
  );
});

interface MediaWorkspaceSidebarProps extends HTMLAttributes<HTMLElement> {
  "aria-label": string;
}

function Sidebar({ className, ...rest }: MediaWorkspaceSidebarProps) {
  return <aside {...rest} className={cn("sc-media-workspace__sidebar", className)} role="region" />;
}

interface MediaWorkspaceSidebarHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  count: number;
  countLabel: string;
  description: ReactNode;
  title: ReactNode;
}

function SidebarHeader({
  className,
  count,
  countLabel,
  description,
  title,
  ...rest
}: MediaWorkspaceSidebarHeaderProps) {
  return (
    <div {...rest} className={cn("sc-media-workspace__sidebar-header", className)}>
      <div className="sc-media-workspace__sidebar-heading">
        <h3 className="sc-media-workspace__sidebar-title">{title}</h3>
        <p className="sc-media-workspace__sidebar-description">{description}</p>
      </div>
      <span className="sc-media-workspace__sidebar-count" aria-label={countLabel}>
        {count}
      </span>
    </div>
  );
}

interface MediaWorkspaceListProps extends HTMLAttributes<HTMLOListElement> {
  "aria-label": string;
}

const List = forwardRef<HTMLOListElement, MediaWorkspaceListProps>(function List(
  { className, ...rest },
  ref,
) {
  return <ol {...rest} ref={ref} className={cn("sc-media-workspace__list", className)} />;
});

interface MediaWorkspaceItemProps extends LiHTMLAttributes<HTMLLIElement> {
  selected?: boolean;
}

const Item = forwardRef<HTMLLIElement, MediaWorkspaceItemProps>(function Item(
  { className, selected = false, ...rest },
  ref,
) {
  return (
    <li
      {...rest}
      ref={ref}
      className={cn("sc-media-workspace__item", className)}
      data-selected={selected ? "true" : "false"}
    />
  );
});

function ItemHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("sc-media-workspace__item-header", className)} />;
}

const ItemSelect = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function ItemSelect({ className, type = "button", ...rest }, ref) {
    return (
      <button
        {...rest}
        ref={ref}
        className={cn("sc-media-workspace__item-select", className)}
        type={type}
      />
    );
  },
);

function ItemNumber({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...rest} className={cn("sc-media-workspace__item-number", className)} />;
}

function Empty({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("sc-media-workspace__empty", className)} />;
}

export const MediaWorkspace = {
  Root,
  Canvas,
  Sidebar,
  SidebarHeader,
  List,
  Item,
  ItemHeader,
  ItemSelect,
  ItemNumber,
  Empty,
};
