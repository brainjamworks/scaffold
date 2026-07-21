import {
  ArchiveIcon as Archive,
  CloudArrowUpIcon as CloudUpload,
  FilmStripIcon as Video,
  FileIcon as FileGeneric,
  FilesIcon as Files,
  FilePdfIcon as Pdf,
  FileTextIcon as Document,
  FolderOpenIcon as Folder,
  ImageIcon as ImagePlaceholder,
  LinkIcon as Link,
  MicrophoneIcon as Audio,
  PlusIcon as Plus,
  PresentationIcon as Presentation,
  TableIcon as Spreadsheet,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/ui/components/Button/Button";
import * as Dialog from "@/ui/components/Dialog/Dialog";
import { Input, Label } from "@/ui/components/Input/Input";
import * as VisuallyHidden from "@/ui/components/VisuallyHidden/VisuallyHidden";
import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import {
  type MediaListItem,
  type MediaUploadResult,
  type MediaUploadType,
} from "@/host/ports/media";
import { isSafeExternalMediaUrl, validateMediaUploadFile } from "@/host/media-policy";

import "./file-picker-modal.css";

/* ──────────────────────────────────────────────────────────────────────────
 * Filter sets
 * ────────────────────────────────────────────────────────────────────── */

const MEDIA_TYPES = ["image", "audio", "video"] as const satisfies readonly MediaUploadType[];
const DOCUMENT_TYPES = [
  "pdf",
  "document",
  "spreadsheet",
  "presentation",
  "archive",
] as const satisfies readonly MediaUploadType[];

type FilePickerKind = "media" | "documents" | "all";
type FilterValue = MediaUploadType | "all";
type MetadataField = "alt" | "title";
type ViewMode = "browse" | "upload" | "url";

interface FilterSpec {
  type: FilterValue;
  label: string;
  noun: string;
  article: "a" | "an";
  accept: string;
  icon: Icon;
  hintCopy: string;
}

const FILTER_SPECS: Record<FilterValue, FilterSpec> = {
  all: {
    type: "all",
    label: "All",
    noun: "file",
    article: "a",
    accept: "",
    icon: Files,
    hintCopy: "Any file",
  },
  image: {
    type: "image",
    label: "Image",
    noun: "image",
    article: "an",
    accept: "image/*",
    icon: ImagePlaceholder,
    hintCopy: "PNG, JPG, GIF, WebP",
  },
  audio: {
    type: "audio",
    label: "Audio",
    noun: "audio file",
    article: "an",
    accept: "audio/*",
    icon: Audio,
    hintCopy: "MP3, WAV, OGG, M4A",
  },
  video: {
    type: "video",
    label: "Video",
    noun: "video",
    article: "a",
    accept: "video/*",
    icon: Video,
    hintCopy: "MP4, WebM, MOV",
  },
  pdf: {
    type: "pdf",
    label: "PDF",
    noun: "PDF",
    article: "a",
    accept: "application/pdf,.pdf",
    icon: Pdf,
    hintCopy: "PDF",
  },
  document: {
    type: "document",
    label: "Document",
    noun: "document",
    article: "a",
    accept: ".doc,.docx,.odt,.rtf",
    icon: Document,
    hintCopy: "DOC, DOCX, ODT, RTF",
  },
  spreadsheet: {
    type: "spreadsheet",
    label: "Sheet",
    noun: "spreadsheet",
    article: "a",
    accept: ".csv,.ods,.xls,.xlsx",
    icon: Spreadsheet,
    hintCopy: "CSV, XLSX, ODS",
  },
  presentation: {
    type: "presentation",
    label: "Slides",
    noun: "slide deck",
    article: "a",
    accept: ".odp,.ppt,.pptx",
    icon: Presentation,
    hintCopy: "PPT, PPTX, ODP",
  },
  archive: {
    type: "archive",
    label: "Archive",
    noun: "archive",
    article: "an",
    accept: ".zip,.7z,.rar,.gz,.tar,.tgz",
    icon: Archive,
    hintCopy: "ZIP, 7Z, RAR, TAR",
  },
  text: {
    type: "text",
    label: "Text",
    noun: "text file",
    article: "a",
    accept: ".txt,.md,text/plain,text/markdown",
    icon: Document,
    hintCopy: "TXT, MD",
  },
  other: {
    type: "other",
    label: "Other",
    noun: "file",
    article: "a",
    accept: "",
    icon: FileGeneric,
    hintCopy: "Any other file",
  },
};

function filtersForKind(kind: FilePickerKind): MediaUploadType[] {
  switch (kind) {
    case "media":
      return [...MEDIA_TYPES];
    case "documents":
      return [...DOCUMENT_TYPES];
    case "all":
      return [...MEDIA_TYPES, ...DOCUMENT_TYPES];
  }
}

function filtersForPicker(
  kind: FilePickerKind,
  allowedMediaTypes?: readonly MediaUploadType[],
): MediaUploadType[] {
  const base = filtersForKind(kind);
  if (!allowedMediaTypes?.length) return base;

  const allowed = new Set(allowedMediaTypes);
  const filtered = base.filter((type) => allowed.has(type));
  return filtered.length > 0 ? filtered : base;
}

function defaultMetadataFields(kind: FilePickerKind): MetadataField[] {
  if (kind === "documents") return ["title"];
  return ["alt"];
}

function defaultExternalUrlAllowed(kind: FilePickerKind): boolean {
  return kind !== "documents";
}

function defaultTitle(kind: FilePickerKind): string {
  switch (kind) {
    case "documents":
      return "Add document";
    case "all":
      return "Add file";
    case "media":
    default:
      return "Add media";
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImageType(t: MediaUploadType): boolean {
  return t === "image";
}

/* ──────────────────────────────────────────────────────────────────────────
 * Public types
 * ────────────────────────────────────────────────────────────────────── */

export interface FilePickerResult {
  source: "upload" | "url" | "browse";
  mediaType: MediaUploadType;
  alt?: string;
  title?: string;
  upload?: MediaUploadResult;
  url?: string;
  browse?: MediaListItem;
}

export interface FilePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: (result: FilePickerResult) => boolean | void;
  kind: FilePickerKind;
  allowedMediaTypes?: readonly MediaUploadType[];
  defaultMediaType?: MediaUploadType;
  title?: string;
  metadataFields?: MetadataField[];
  allowExternalUrl?: boolean;
}

function safeDomId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "");
}

/* ──────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────── */

export function FilePickerModal({
  open,
  onOpenChange,
  onResolved,
  kind,
  allowedMediaTypes,
  defaultMediaType,
  title,
  metadataFields = defaultMetadataFields(kind),
  allowExternalUrl = defaultExternalUrlAllowed(kind),
}: FilePickerModalProps) {
  const mediaPort = useMediaPort();
  const browseEnabled = Boolean(mediaPort?.list);
  const filters = useMemo(
    () => filtersForPicker(kind, allowedMediaTypes),
    [allowedMediaTypes, kind],
  );
  const initialFilter = useMemo<MediaUploadType>(() => {
    if (defaultMediaType && filters.includes(defaultMediaType)) return defaultMediaType;
    return filters[0]!;
  }, [defaultMediaType, filters]);

  const [filter, setFilter] = useState<MediaUploadType>(initialFilter);
  const [view, setView] = useState<ViewMode>(browseEnabled ? "browse" : "upload");
  const [progress, setProgress] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [externalTitle, setExternalTitle] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [library, setLibrary] = useState<MediaListItem[] | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const libraryRequestRef = useRef<{
    key: FilePickerKind;
    sequence: number;
  } | null>(null);
  const libraryRequestSequenceRef = useRef(0);
  const lastOpenRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const idPrefix = `file-picker-${safeDomId(useId())}`;
  const errorId = `${idPrefix}-error`;

  useEffect(() => {
    if (open && !lastOpenRef.current) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    lastOpenRef.current = open;

    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(null);
      setProgress(null);
      setPendingFile(null);
      setUrl("");
      setAlt("");
      setExternalTitle("");
      setDragActive(false);
      setFilter(initialFilter);
      setLibrary(null);
      setLibraryError(null);
      libraryRequestRef.current = null;
      setView(browseEnabled ? "browse" : "upload");
    }
  }, [open, initialFilter, browseEnabled]);

  const refreshLibrary = useCallback(() => {
    const list = mediaPort?.list;
    if (!list) return;
    if (libraryRequestRef.current?.key === kind) return;

    const sequence = libraryRequestSequenceRef.current + 1;
    libraryRequestSequenceRef.current = sequence;
    libraryRequestRef.current = { key: kind, sequence };
    setLibraryLoading(true);
    setLibraryError(null);

    void list({ kind })
      .then((items) => {
        if (libraryRequestRef.current?.sequence !== sequence) return;
        setLibrary(items);
      })
      .catch((e) => {
        if (libraryRequestRef.current?.sequence !== sequence) return;
        setLibrary([]);
        setLibraryError(e instanceof Error ? e.message : "Could not load files");
      })
      .finally(() => {
        if (libraryRequestRef.current?.sequence !== sequence) return;
        libraryRequestRef.current = null;
        setLibraryLoading(false);
      });
  }, [mediaPort, kind]);

  useEffect(() => {
    if (open && view === "browse" && browseEnabled && library === null) {
      refreshLibrary();
    }
  }, [open, view, browseEnabled, library, refreshLibrary]);

  const filteredLibrary = useMemo(() => {
    if (!library) return [];
    return library.filter((item) => item.mediaType === filter);
  }, [library, filter]);

  const activeSpec = FILTER_SPECS[filter];
  const headerTitle = title ?? defaultTitle(kind);
  const accepting = activeSpec.accept || undefined;
  const uploadDisabled = !mediaPort;
  const isUploading = pendingFile !== null && progress !== null && progress < 100;

  const collectMetadata = () => ({
    ...(metadataFields.includes("alt") && alt ? { alt } : {}),
    ...(metadataFields.includes("title") && externalTitle ? { title: externalTitle } : {}),
  });

  const handleFile = async (file: File) => {
    setError(null);
    setProgress(0);
    setPendingFile(file);
    try {
      if (!mediaPort) throw new Error("No upload destination is configured.");
      const inferred = validateMediaUploadFile(file, filter);
      const result = await mediaPort.upload(file, { mediaType: inferred }, (pct) =>
        setProgress(pct),
      );
      const accepted = onResolved({
        source: "upload",
        mediaType: inferred,
        upload: result,
        ...collectMetadata(),
      });
      if (accepted !== false) {
        onOpenChange(false);
      } else {
        setProgress(null);
        setPendingFile(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setProgress(null);
      setPendingFile(null);
    }
  };

  const handleUrl = () => {
    if (!url) {
      setError("Paste a URL first.");
      return;
    }
    if (!isSafeExternalMediaUrl(url)) {
      setError("Use a valid http or https URL.");
      return;
    }
    const accepted = onResolved({
      source: "url",
      mediaType: filter,
      url,
      ...collectMetadata(),
    });
    if (accepted !== false) onOpenChange(false);
  };

  const handleBrowseSelect = (item: MediaListItem) => {
    const accepted = onResolved({
      source: "browse",
      mediaType: item.mediaType,
      browse: item,
      ...collectMetadata(),
    });
    if (accepted !== false) onOpenChange(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const VIEW_OPTIONS: {
    value: ViewMode;
    label: string;
    icon: Icon;
    visible: boolean;
  }[] = [
    { value: "browse", label: "Library", icon: Folder, visible: browseEnabled },
    { value: "upload", label: "Upload", icon: CloudUpload, visible: true },
    { value: "url", label: "URL", icon: Link, visible: allowExternalUrl },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="sc-file-picker-overlay"
          style={{ zIndex: zIndex.modalBackdrop }}
        />
        <Dialog.Content
          className="sc-file-picker-dialog"
          style={{ zIndex: zIndex.modal }}
          onCloseAutoFocus={(event) => {
            const target = returnFocusRef.current;
            if (!target || !document.contains(target)) return;
            event.preventDefault();
            target.focus();
          }}
        >
          {/* Header */}
          <div className="sc-file-picker-header">
            <Dialog.Title className="sc-file-picker-title">{headerTitle}</Dialog.Title>
            <ViewSwitcher
              options={VIEW_OPTIONS.filter((o) => o.visible)}
              value={view}
              onChange={setView}
              idPrefix={idPrefix}
            />
            <VisuallyHidden.Root asChild>
              <Dialog.Description>
                Choose a file from the library, upload a new one
                {allowExternalUrl ? ", or paste a URL" : ""}.
              </Dialog.Description>
            </VisuallyHidden.Root>
          </div>

          {/* Filter bar */}
          {filters.length > 1 ? (
            <div className="sc-file-picker-filter-bar">
              <span className="sc-file-picker-filter-label">Filter</span>
              {filters.map((value) => {
                const spec = FILTER_SPECS[value];
                const IconComponent = spec.icon;
                const active = filter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    aria-pressed={active}
                    className={cn("sc-file-picker-filter-button", active && "is-active")}
                  >
                    <IconComponent size={12} weight="bold" aria-hidden />
                    {spec.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Main pane */}
          <div
            id={`${idPrefix}-panel-${view}`}
            role="tabpanel"
            aria-labelledby={`${idPrefix}-tab-${view}`}
            tabIndex={0}
            className="sc-file-picker-panel"
          >
            {view === "browse" ? (
              <BrowsePane
                loading={libraryLoading}
                error={libraryError}
                items={filteredLibrary}
                spec={activeSpec}
                onPick={handleBrowseSelect}
                onUploadClick={() => setView("upload")}
              />
            ) : view === "upload" ? (
              <UploadPane
                spec={activeSpec}
                dragActive={dragActive}
                isUploading={isUploading}
                pendingFile={pendingFile}
                progress={progress}
                uploadDisabled={uploadDisabled}
                onPickFile={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onCancelUpload={() => {
                  setPendingFile(null);
                  setProgress(null);
                }}
                {...(error ? { errorId } : {})}
              />
            ) : (
              <UrlPane
                spec={activeSpec}
                url={url}
                onUrlChange={setUrl}
                onSubmit={handleUrl}
                error={error}
                errorId={errorId}
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              {...(accepting ? { accept: accepting } : {})}
              className="sc-sr-only"
              tabIndex={-1}
              aria-label={`Choose ${activeSpec.noun}`}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            {error && (
              <p id={errorId} role="alert" className="sc-file-picker-error">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="sc-file-picker-footer">
            <MetadataRow
              metadataFields={metadataFields}
              alt={alt}
              setAlt={setAlt}
              externalTitle={externalTitle}
              setExternalTitle={setExternalTitle}
            />
            <Button type="button" variant="ghost" size="md" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * View switcher (top-right of header)
 * ────────────────────────────────────────────────────────────────────── */

function ViewSwitcher({
  options,
  value,
  onChange,
  idPrefix,
}: {
  options: { value: ViewMode; label: string; icon: Icon }[];
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  idPrefix: string;
}) {
  const focusTab = (event: React.KeyboardEvent<HTMLButtonElement>, nextValue: ViewMode) => {
    const tablist = event.currentTarget.closest('[role="tablist"]');
    onChange(nextValue);
    window.requestAnimationFrame(() => {
      const tab = tablist?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${nextValue}`);
      tab?.focus();
    });
  };

  return (
    <div role="tablist" aria-label="Source" className="sc-file-picker-tabs">
      {options.map(({ value: v, label, icon: IconComponent }) => {
        const active = value === v;
        const index = options.findIndex((option) => option.value === v);
        const prev = options[(index - 1 + options.length) % options.length]!;
        const next = options[(index + 1) % options.length]!;
        return (
          <button
            key={v}
            id={`${idPrefix}-tab-${v}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${v}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(v)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                focusTab(event, prev.value);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                focusTab(event, next.value);
              } else if (event.key === "Home") {
                event.preventDefault();
                focusTab(event, options[0]!.value);
              } else if (event.key === "End") {
                event.preventDefault();
                focusTab(event, options[options.length - 1]!.value);
              }
            }}
            className={cn("sc-file-picker-tab", active && "is-active")}
          >
            <IconComponent size={13} weight="bold" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Browse pane — grid of previously-uploaded media
 * ────────────────────────────────────────────────────────────────────── */

function BrowsePane({
  loading,
  error,
  items,
  spec,
  onPick,
  onUploadClick,
}: {
  loading: boolean;
  error: string | null;
  items: MediaListItem[];
  spec: FilterSpec;
  onPick: (item: MediaListItem) => void;
  onUploadClick: () => void;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="sc-file-picker-browse-state">
        <p role="status" aria-live="polite" className="sc-file-picker-browse-status">
          Loading files
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="sc-file-picker-browse-state sc-file-picker-browse-state--error">
        <p
          role="alert"
          className="sc-file-picker-browse-status sc-file-picker-browse-status--error"
        >
          {error}
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={onUploadClick}>
          Upload a new file instead
        </Button>
      </div>
    );
  }
  if (items.length === 0) {
    const SpecIcon = spec.icon;
    return (
      <div className="sc-file-picker-browse-state sc-file-picker-browse-state--empty">
        <span className="sc-file-picker-empty-icon">
          <SpecIcon size={22} weight="duotone" aria-hidden />
        </span>
        <div className="sc-file-picker-empty-copy">
          <p className="sc-file-picker-empty-title">No {spec.label.toLowerCase()} files yet</p>
          <p className="sc-file-picker-empty-description">
            Upload {spec.article} {spec.noun} to see it here next time.
          </p>
        </div>
        <Button type="button" variant="primary" size="md" onClick={onUploadClick}>
          Upload a file
        </Button>
      </div>
    );
  }

  return (
    <div className="sc-file-picker-library-grid">
      {items.map((item) => (
        <LibraryCard key={item.id} item={item} onClick={() => onPick(item)} />
      ))}
    </div>
  );
}

function LibraryCard({ item, onClick }: { item: MediaListItem; onClick: () => void }) {
  const spec = FILTER_SPECS[item.mediaType] ?? FILTER_SPECS.other;
  const SpecIcon = spec.icon;
  const isImage = isImageType(item.mediaType);
  const thumb = item.thumbnailUrl ?? item.url;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Choose ${spec.noun}: ${item.fileName}`}
      className="sc-file-picker-library-card"
    >
      <div className="sc-file-picker-library-preview">
        {isImage ? (
          <img src={thumb} alt="" className="sc-file-picker-library-thumbnail" loading="lazy" />
        ) : (
          <SpecIcon
            size={32}
            weight="duotone"
            className="sc-file-picker-library-icon"
            aria-hidden
          />
        )}
        <span className="sc-file-picker-library-badge">
          <SpecIcon size={9} weight="bold" aria-hidden />
          {spec.label}
        </span>
      </div>
      <div className="sc-file-picker-library-copy">
        <p className="sc-file-picker-library-name">{item.fileName}</p>
        <p className="sc-file-picker-library-meta">{formatFileSize(item.size)}</p>
      </div>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Upload pane
 * ────────────────────────────────────────────────────────────────────── */

function UploadPane({
  spec,
  dragActive,
  isUploading,
  pendingFile,
  progress,
  uploadDisabled,
  onPickFile,
  onDragOver,
  onDragLeave,
  onDrop,
  onCancelUpload,
  errorId,
}: {
  spec: FilterSpec;
  dragActive: boolean;
  isUploading: boolean;
  pendingFile: File | null;
  progress: number | null;
  uploadDisabled: boolean;
  onPickFile: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onCancelUpload: () => void;
  errorId?: string;
}) {
  const titleId = useId();
  const hintId = useId();

  if (isUploading && pendingFile) {
    return <UploadInProgress file={pendingFile} progress={progress} onCancel={onCancelUpload} />;
  }
  if (uploadDisabled) {
    return (
      <div className="sc-file-picker-upload-disabled">
        <p className="sc-file-picker-upload-disabled-copy">
          Direct upload is unavailable in this context. Switch to the URL tab to add by link
          instead.
        </p>
      </div>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPickFile}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPickFile();
        }
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-labelledby={titleId}
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
      aria-invalid={errorId ? true : undefined}
      className={cn("sc-file-picker-dropzone", dragActive && "is-active")}
    >
      <BrandMarkSlot activeIcon={spec.icon} active={dragActive} />
      <div className="sc-file-picker-dropzone-copy">
        <p id={titleId} className="sc-file-picker-dropzone-title">
          {dragActive ? "Release to upload" : `Drop ${spec.article} ${spec.noun} here`}
        </p>
        <p id={hintId} className="sc-file-picker-dropzone-hint">
          {dragActive ? "\u00A0" : `or click to browse · ${spec.hintCopy}`}
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * URL pane
 * ────────────────────────────────────────────────────────────────────── */

function UrlPane({
  spec,
  url,
  onUrlChange,
  onSubmit,
  error,
  errorId,
}: {
  spec: FilterSpec;
  url: string;
  onUrlChange: (v: string) => void;
  onSubmit: () => void;
  error: string | null;
  errorId: string;
}) {
  const helpId = useId();

  return (
    <div className="sc-file-picker-url-pane">
      <div className="sc-file-picker-url-field">
        <Label htmlFor="file-picker-url">{spec.label} URL</Label>
        <Input
          id="file-picker-url"
          type="url"
          placeholder="https://example.com/file"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={[helpId, error ? errorId : null].filter(Boolean).join(" ")}
        />
        <p id={helpId} className="sc-file-picker-url-help">
          The file stays at this URL. We don't copy or proxy it.
        </p>
      </div>
      <div className="sc-file-picker-url-actions">
        <Button type="button" variant="primary" size="md" disabled={!url} onClick={onSubmit}>
          Use URL
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Metadata row (in the footer)
 * ────────────────────────────────────────────────────────────────────── */

function MetadataRow({
  metadataFields,
  alt,
  setAlt,
  externalTitle,
  setExternalTitle,
}: {
  metadataFields: MetadataField[];
  alt: string;
  setAlt: (v: string) => void;
  externalTitle: string;
  setExternalTitle: (v: string) => void;
}) {
  const altHintId = useId();
  const titleHintId = useId();

  if (metadataFields.length === 0) {
    return <div className="sc-file-picker-metadata-spacer" />;
  }
  return (
    <div className="sc-file-picker-metadata">
      {metadataFields.includes("alt") ? (
        <div className="sc-file-picker-metadata-field">
          <Label htmlFor="file-picker-alt" className="sc-file-picker-metadata-label">
            Alt text
          </Label>
          <Input
            id="file-picker-alt"
            type="text"
            placeholder="Describe for screen readers"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            aria-describedby={altHintId}
            className="sc-file-picker-metadata-input"
          />
          <VisuallyHidden.Root asChild>
            <p id={altHintId}>Describe this media for screen readers.</p>
          </VisuallyHidden.Root>
        </div>
      ) : null}
      {metadataFields.includes("title") ? (
        <div className="sc-file-picker-metadata-field">
          <Label htmlFor="file-picker-title" className="sc-file-picker-metadata-label">
            Title
          </Label>
          <Input
            id="file-picker-title"
            type="text"
            placeholder="Shown with the file"
            value={externalTitle}
            onChange={(e) => setExternalTitle(e.target.value)}
            aria-describedby={titleHintId}
            className="sc-file-picker-metadata-input"
          />
          <VisuallyHidden.Root asChild>
            <p id={titleHintId}>Name this file in the document.</p>
          </VisuallyHidden.Root>
        </div>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Brand-mark slot
 * ────────────────────────────────────────────────────────────────────── */

function BrandMarkSlot({ activeIcon: ActiveIcon, active }: { activeIcon: Icon; active: boolean }) {
  return (
    <div aria-hidden className={cn("sc-file-picker-brand-slot", active && "is-active")}>
      <span className="sc-file-picker-brand-slot-part sc-file-picker-brand-slot-part--primary" />
      <span
        className={cn(
          "sc-file-picker-brand-slot-part sc-file-picker-brand-slot-part--empty",
          active && "is-active",
        )}
      >
        <ActiveIcon size={14} weight="bold" />
      </span>
      <span className="sc-file-picker-brand-slot-part sc-file-picker-brand-slot-part--accent" />
      <span className="sc-file-picker-brand-slot-part sc-file-picker-brand-slot-part--secondary" />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Upload-in-progress card
 * ────────────────────────────────────────────────────────────────────── */

function UploadInProgress({
  file,
  progress,
  onCancel,
}: {
  file: File;
  progress: number | null;
  onCancel: () => void;
}) {
  const pct = progress ?? 0;
  const progressId = useId();
  const uploadStatus = `Uploading ${file.name}, ${Math.round(pct)}% uploaded.`;
  return (
    <div className="sc-file-picker-upload-progress">
      <p id={progressId} role="status" aria-live="polite" className="sc-sr-only">
        {uploadStatus}
      </p>
      <div className="sc-file-picker-upload-progress-row">
        <span className="sc-file-picker-upload-progress-icon">
          <Plus size={16} weight="bold" aria-hidden />
        </span>
        <div className="sc-file-picker-upload-progress-copy">
          <p className="sc-file-picker-upload-progress-title">{file.name}</p>
          <p className="sc-file-picker-upload-progress-meta">
            {formatFileSize(file.size)} · {Math.round(pct)}%
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Cancel upload of ${file.name}`}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      <div className="sc-file-picker-upload-progress-track">
        <div
          role="progressbar"
          aria-label={`Uploading ${file.name}`}
          aria-describedby={progressId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-valuetext={`${Math.round(pct)}% uploaded`}
          className="sc-file-picker-upload-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
