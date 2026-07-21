import { createElement, useEffect, useState } from "react";

import {
  getIconDisplayName,
  getIconNodes,
  loadIconCatalog,
  type IconNode,
  type IconNodeAttrs,
  type IconNodeTag,
} from "@/ui/icons/catalog";
import { cn } from "@/lib/cn";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import type { IconValue } from "@/schemas/media/icon";

import "./icon-renderer.css";

const ALLOWED_TAGS = new Set<IconNodeTag>([
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
]);

const ALLOWED_ATTRS = new Set([
  "clip-rule",
  "cx",
  "cy",
  "d",
  "fill-rule",
  "height",
  "points",
  "r",
  "rx",
  "ry",
  "width",
  "x",
  "x1",
  "x2",
  "y",
  "y1",
  "y2",
]);

const ATTR_ALIASES: Record<string, string> = {
  "clip-rule": "clipRule",
  "fill-rule": "fillRule",
};

export interface IconRendererProps {
  className?: string;
  value?: IconValue | null;
  fallbackValue?: IconValue | null;
  label?: string;
  decorative?: boolean;
  loadFullCatalog?: boolean;
}

function readIconText(value: IconValue | null | undefined): string {
  if (!value) return "";
  if (value.kind === "catalog") return value.name;
  if (value.kind === "emoji") return value.value;
  return value.mediaId;
}

function readIconLabel(value: IconValue): string {
  if (value.kind === "catalog") return getIconDisplayName(value.name);
  if (value.kind === "emoji") return value.value;
  return value.alt?.trim() || "Image icon";
}

function sanitizeAttrs(attrs: IconNodeAttrs): Record<string, string | number> {
  const safe: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(attrs)) {
    if (!ALLOWED_ATTRS.has(name)) continue;
    if (typeof value !== "string" && typeof value !== "number") continue;
    safe[ATTR_ALIASES[name] ?? name] = value;
  }
  return safe;
}

function renderIconNodes(nodes: readonly IconNode[]) {
  return nodes
    .filter(([tag]) => ALLOWED_TAGS.has(tag))
    .map(([tag, attrs], index) =>
      createElement(tag, { key: `${tag}-${index}`, ...sanitizeAttrs(attrs) }),
    );
}

function fallbackInitials(value: string): string {
  return value
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function IconRenderer({
  className,
  decorative = true,
  fallbackValue = null,
  label,
  loadFullCatalog = true,
  value,
}: IconRendererProps) {
  const [, setRevision] = useState(0);
  const mediaPort = useMediaPort();
  const effectiveValue = value ?? fallbackValue ?? null;
  const trimmedValue = readIconText(effectiveValue).trim();
  const mediaId = effectiveValue?.kind === "media" ? effectiveValue.mediaId : null;
  const [resolvedMedia, setResolvedMedia] = useState<{
    mediaId: string;
    url: string;
  } | null>(null);
  const nodes =
    effectiveValue?.kind === "catalog" && trimmedValue ? getIconNodes(trimmedValue) : null;

  useEffect(() => {
    if (!loadFullCatalog || !trimmedValue || effectiveValue?.kind !== "catalog" || nodes) {
      return;
    }
    let active = true;
    void loadIconCatalog()
      .catch(() => undefined)
      .then(() => {
        if (active) setRevision((current) => current + 1);
      });
    return () => {
      active = false;
    };
  }, [effectiveValue?.kind, loadFullCatalog, nodes, trimmedValue]);

  useEffect(() => {
    if (!mediaId) {
      setResolvedMedia(null);
      return;
    }

    if (!mediaPort) {
      setResolvedMedia(null);
      return;
    }

    let active = true;
    setResolvedMedia(null);
    void mediaPort
      .resolve(mediaId)
      .then((url) => {
        if (active) setResolvedMedia({ mediaId, url });
      })
      .catch(() => {
        if (active) setResolvedMedia(null);
      });

    return () => {
      active = false;
    };
  }, [mediaId, mediaPort]);

  if (!effectiveValue || !trimmedValue) return null;

  const accessibleName = label ?? readIconLabel(effectiveValue);
  const ariaProps = decorative
    ? { "aria-hidden": true }
    : { role: "img", "aria-label": accessibleName };

  if (effectiveValue.kind === "emoji") {
    return (
      <span className={cn("sc-icon-renderer", className)} data-kind="emoji" {...ariaProps}>
        {trimmedValue}
      </span>
    );
  }

  if (effectiveValue.kind === "media") {
    if (resolvedMedia?.mediaId === effectiveValue.mediaId) {
      return (
        <img
          src={resolvedMedia.url}
          alt={decorative ? "" : accessibleName}
          className={cn("sc-icon-renderer", className)}
          data-kind="media"
          {...(decorative ? { "aria-hidden": true } : {})}
        />
      );
    }

    return (
      <span className={cn("sc-icon-renderer", className)} data-kind="fallback" {...ariaProps}>
        {fallbackInitials(accessibleName)}
      </span>
    );
  }

  if (nodes) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("sc-icon-renderer", className)}
        data-kind="svg"
        {...ariaProps}
      >
        {renderIconNodes(nodes)}
      </svg>
    );
  }

  return (
    <span className={cn("sc-icon-renderer", className)} data-kind="fallback" {...ariaProps}>
      {fallbackInitials(trimmedValue)}
    </span>
  );
}
