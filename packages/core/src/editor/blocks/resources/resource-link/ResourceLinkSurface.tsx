import {
  ArticleIcon as Article,
  ArrowUpRightIcon as ArrowUpRight,
  FilePdfIcon as FilePdf,
  HeadphonesIcon as Headphones,
  LinkSimpleIcon as LinkSimple,
  PlayCircleIcon as PlayCircle,
} from "@phosphor-icons/react";
import type { ResourceLinkData, ResourceLinkKind } from "@scaffold/contracts";
import type { ReactNode } from "react";

import { isHttpOrHttpsUrl } from "@scaffold/contracts";

import { RESOURCE_LINK_KIND_LABELS, readResourceHost } from "./resource-link-presentation";

import "./ResourceLink.css";

export const RESOURCE_LINK_KIND_ICONS: Record<ResourceLinkKind, typeof Article> = {
  article: Article,
  video: PlayCircle,
  pdf: FilePdf,
  audio: Headphones,
  link: LinkSimple,
};

export function ResourceLinkSurface({
  children,
  data,
  editable,
  frameAttributes,
  controls,
  onOpen,
}: {
  children: ReactNode;
  data: ResourceLinkData;
  editable: boolean;
  frameAttributes?: Record<string, string>;
  controls?: ReactNode;
  onOpen?: () => void;
}) {
  const host = readResourceHost(data.url);
  const kindLabel = RESOURCE_LINK_KIND_LABELS[data.kind];
  const KindIcon = RESOURCE_LINK_KIND_ICONS[data.kind];

  const safeUrl = isHttpOrHttpsUrl(data.url) ? data.url : "";
  const interactive = !editable && safeUrl.length > 0;
  const Surface = interactive ? "a" : "div";
  const surfaceProps = interactive
    ? {
        href: safeUrl,
        target: "_blank" as const,
        rel: "noopener noreferrer",
        onClick: onOpen,
      }
    : {};

  return (
    <Surface
      {...surfaceProps}
      {...frameAttributes}
      className={`sc-course-resource-link${interactive ? " sc-course-resource-link--interactive" : ""}`}
      data-show-description={data.showDescription ? "true" : "false"}
    >
      <span contentEditable={false} aria-hidden className="sc-course-resource-link__kind-icon">
        <KindIcon size={20} weight="regular" />
      </span>

      <div className="sc-course-resource-link__body">
        {children}
        <div contentEditable={false} className="sc-course-resource-link__meta">
          <span>{kindLabel}</span>
          {host ? (
            <>
              <span aria-hidden>·</span>
              <span className="sc-course-resource-link__host">{host}</span>
            </>
          ) : null}
        </div>
        {controls}
      </div>

      {safeUrl ? (
        <span
          aria-hidden
          contentEditable={false}
          className={`sc-course-resource-link__open-icon${interactive ? " sc-course-resource-link__open-icon--interactive" : ""}`}
        >
          <ArrowUpRight size={16} weight="bold" />
        </span>
      ) : null}
      {interactive ? (
        <span className="sc-course-resource-link__external-hint">Opens in new tab</span>
      ) : null}
    </Surface>
  );
}
