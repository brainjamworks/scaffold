import {
  CaretDownIcon,
  ImageIcon,
  MagnifyingGlassIcon,
  SmileyIcon,
  SquaresFourIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useReducer, useRef, useState, type ReactElement } from "react";

import {
  getEmojiGroups,
  getEmojisByGroup,
  getIconCatalogState,
  getIconCategories,
  getIconDisplayName,
  getIconsByCategory,
  loadIconCatalog,
  searchEmojis,
  searchIcons,
} from "@/ui/icons/catalog";
import {
  catalogIconValue,
  emojiIconValue,
  mediaIconValue,
  type IconValue,
} from "@/schemas/media/icon";
import { iconSm } from "@/ui/tokens/icon-sizes";

import { Button } from "@/ui/components/Button/Button";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { Input } from "@/ui/components/Input/Input";
import * as Tabs from "@/ui/components/Tabs/Tabs";
import { EditorFloatingPopover as EditorFloating } from "@/editor/interactions/floating/EditorFloatingPopover";
import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";
import { IconRenderer } from "@/ui/icons/IconRenderer";
import "./icon-picker.css";

type PickerTab = "icons" | "emoji";

const DEFAULT_ICON_PICKER_FALLBACK = catalogIconValue("info");
const ICON_MEDIA_TYPES = ["image"] as const;

export interface IconPickerProps {
  id?: string;
  value?: IconValue | null;
  fallbackValue?: IconValue | null;
  invalid?: boolean;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  clearLabel?: string;
  renderTrigger?: (props: IconPickerTriggerRenderProps) => ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  onValueChange: (value: IconValue | null) => void;
}

export interface IconPickerTriggerRenderProps {
  disabled: boolean;
  displayValue: IconValue | null;
  fallbackValue: IconValue | null;
  invalid: boolean;
  selectedValue: IconValue | null;
}

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [delay, value]);

  return debounced;
}

function readIconText(value: IconValue | null | undefined): string {
  if (!value) return "";
  if (value.kind === "catalog") return value.name;
  if (value.kind === "emoji") return value.value;
  return value.mediaId;
}

function readIconDisplayName(value: IconValue): string {
  if (value.kind === "catalog") return getIconDisplayName(value.name);
  if (value.kind === "emoji") return value.value;
  return value.alt?.trim() || "Image icon";
}

function iconValuesMatch(left: IconValue | null | undefined, right: IconValue): boolean {
  return left?.kind === right.kind && readIconText(left) === readIconText(right);
}

function filePickerResultToIconValue(result: FilePickerResult): IconValue | null {
  const mediaId =
    result.source === "upload"
      ? result.upload?.id
      : result.source === "browse"
        ? result.browse?.id
        : null;
  if (result.mediaType !== "image" || !mediaId) return null;
  return mediaIconValue(mediaId, result.alt);
}

export function IconPicker({
  align = "start",
  clearLabel = "Use default icon",
  disabled = false,
  fallbackValue = DEFAULT_ICON_PICKER_FALLBACK,
  id,
  invalid = false,
  onValueChange,
  renderTrigger,
  side = "bottom",
  value,
}: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>("icons");
  const [query, setQuery] = useState("");
  const [iconCategory, setIconCategory] = useState<string | null>(null);
  const [emojiGroup, setEmojiGroup] = useState(0);
  const [, bumpCatalogRevision] = useReducer((current: number) => current + 1, 0);
  const [catalogState, setCatalogState] = useState(() => getIconCatalogState());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedValue = value ?? null;
  const displayValue = selectedValue || fallbackValue;
  const debouncedQuery = useDebouncedValue(query, 120);

  const refreshCatalogState = useCallback(() => {
    setCatalogState(getIconCatalogState());
    bumpCatalogRevision();
  }, []);

  const requestCatalog = useCallback(() => {
    const promise = loadIconCatalog().catch(() => undefined);
    setCatalogState(getIconCatalogState());
    void promise.finally(refreshCatalogState);
  }, [refreshCatalogState]);

  const categories = getIconCategories();
  const emojiGroups = getEmojiGroups();
  const iconResults = debouncedQuery.trim()
    ? searchIcons(debouncedQuery, 120)
    : getIconsByCategory(iconCategory, 120);
  const emojiResults = debouncedQuery.trim()
    ? searchEmojis(debouncedQuery, 120)
    : getEmojisByGroup(emojiGroup);

  const handleTabChange = (next: string) => {
    setTab(next === "emoji" ? "emoji" : "icons");
    setQuery("");
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
    if (next && !catalogState.loaded && !catalogState.loading) {
      requestCatalog();
    }
  };

  const selectValue = (next: IconValue | null) => {
    onValueChange(next);
    setOpen(false);
    setQuery("");
  };

  const openMediaPicker = () => {
    setOpen(false);
    setQuery("");
    setMediaPickerOpen(true);
  };

  const handleMediaResolved = (result: FilePickerResult) => {
    const next = filePickerResultToIconValue(result);
    if (next) selectValue(next);
  };

  const trigger = renderTrigger?.({
    disabled,
    displayValue,
    fallbackValue,
    invalid,
    selectedValue,
  }) ?? (
    <button
      id={id}
      type="button"
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className="sc-icon-emoji-picker-trigger"
      data-invalid={invalid ? "true" : undefined}
    >
      <span className="sc-icon-emoji-picker-trigger-icon">
        <IconRenderer
          value={displayValue}
          fallbackValue={fallbackValue}
          className="sc-icon-emoji-picker-trigger-glyph"
        />
      </span>
      <span className="sc-icon-emoji-picker-trigger-copy">
        <span className="sc-icon-emoji-picker-trigger-title">
          {selectedValue ? readIconDisplayName(selectedValue) : "Default icon"}
        </span>
        <span className="sc-icon-emoji-picker-trigger-meta">
          {selectedValue
            ? selectedValue.kind === "emoji"
              ? "Emoji"
              : selectedValue.kind === "media"
                ? "Image"
                : selectedValue.name
            : readIconText(fallbackValue)}
        </span>
      </span>
      <CaretDownIcon size={iconSm} aria-hidden className="sc-icon-emoji-picker-trigger-caret" />
    </button>
  );

  return (
    <>
      <EditorFloating.Root open={open} onOpenChange={handleOpenChange}>
        <EditorFloating.Trigger asChild>{trigger}</EditorFloating.Trigger>

        <EditorFloating.Portal>
          <EditorFloating.Content
            align={align}
            side={side}
            sideOffset={8}
            authoringChrome
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              window.setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
            className="sc-icon-emoji-picker-content"
          >
            <Tabs.Root value={tab} onValueChange={handleTabChange}>
              <div className="sc-icon-emoji-picker-toolbar">
                <Tabs.List aria-label="Icon picker type" className="sc-icon-emoji-picker-tabs">
                  <Tabs.Trigger value="icons" className="sc-icon-emoji-picker-tab">
                    <SquaresFourIcon size={iconSm} aria-hidden />
                    Icons
                  </Tabs.Trigger>
                  <Tabs.Trigger value="emoji" className="sc-icon-emoji-picker-tab">
                    <SmileyIcon size={iconSm} aria-hidden />
                    Emoji
                  </Tabs.Trigger>
                </Tabs.List>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="sc-icon-emoji-picker-media-button"
                  onClick={openMediaPicker}
                >
                  <ImageIcon size={iconSm} aria-hidden />
                  Image
                </Button>
                {selectedValue ? (
                  <IconButton
                    aria-label={clearLabel}
                    size="md"
                    variant="ghost"
                    onClick={() => selectValue(null)}
                  >
                    <XIcon size={iconSm} aria-hidden />
                  </IconButton>
                ) : null}
              </div>

              <div className="sc-icon-emoji-picker-search">
                <MagnifyingGlassIcon
                  size={iconSm}
                  aria-hidden
                  className="sc-icon-emoji-picker-search-icon"
                />
                <Input
                  ref={searchInputRef}
                  type="search"
                  aria-label={tab === "icons" ? "Search icons" : "Search emoji"}
                  value={query}
                  placeholder={tab === "icons" ? "Search icons" : "Search emoji"}
                  className="sc-icon-emoji-picker-search-input"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>

              {catalogState.loading ? (
                <div className="sc-icon-emoji-picker-state">Loading catalog</div>
              ) : catalogState.error ? (
                <div className="sc-icon-emoji-picker-state" data-tone="error">
                  <p className="sc-icon-emoji-picker-error">Catalog unavailable</p>
                  <Button variant="secondary" size="sm" onClick={requestCatalog}>
                    Retry
                  </Button>
                </div>
              ) : (
                <>
                  <Tabs.Content value="icons" className="sc-icon-emoji-picker-tab-panel">
                    {!debouncedQuery.trim() ? (
                      <div className="sc-icon-emoji-picker-categories">
                        <button
                          type="button"
                          className="sc-icon-emoji-picker-category"
                          data-active={iconCategory === null ? "true" : undefined}
                          onClick={() => {
                            setIconCategory(null);
                            setQuery("");
                          }}
                        >
                          All
                        </button>
                        {categories.map((category) => (
                          <button
                            key={category.slug}
                            type="button"
                            className="sc-icon-emoji-picker-category"
                            data-active={iconCategory === category.slug ? "true" : undefined}
                            title={`${category.title} (${category.count})`}
                            onClick={() => {
                              setIconCategory(category.slug);
                              setQuery("");
                            }}
                          >
                            {category.title}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="sc-icon-emoji-picker-grid">
                      {iconResults.map((name) => (
                        <button
                          key={name}
                          type="button"
                          aria-label={`Select ${getIconDisplayName(name)} icon`}
                          title={name}
                          className="sc-icon-emoji-picker-item"
                          data-active={
                            iconValuesMatch(selectedValue, catalogIconValue(name))
                              ? "true"
                              : undefined
                          }
                          onClick={() => selectValue(catalogIconValue(name))}
                        >
                          <IconRenderer
                            value={catalogIconValue(name)}
                            className="sc-icon-emoji-picker-item-glyph"
                            loadFullCatalog={false}
                          />
                        </button>
                      ))}
                      {iconResults.length === 0 ? (
                        <p className="sc-icon-emoji-picker-empty">No icons found</p>
                      ) : null}
                    </div>
                  </Tabs.Content>

                  <Tabs.Content value="emoji" className="sc-icon-emoji-picker-tab-panel">
                    {!debouncedQuery.trim() ? (
                      <div className="sc-icon-emoji-picker-categories">
                        {emojiGroups.map((group, index) => (
                          <button
                            key={group.slug}
                            type="button"
                            className="sc-icon-emoji-picker-category"
                            data-active={emojiGroup === index ? "true" : undefined}
                            title={`${group.name} (${group.count})`}
                            onClick={() => {
                              setEmojiGroup(index);
                              setQuery("");
                            }}
                          >
                            {group.preview} {group.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="sc-icon-emoji-picker-grid">
                      {emojiResults.map((emoji) => (
                        <button
                          key={`${emoji.emoji}-${emoji.name}`}
                          type="button"
                          aria-label={`Select ${emoji.name}`}
                          title={emoji.name}
                          className="sc-icon-emoji-picker-item"
                          data-active={
                            iconValuesMatch(selectedValue, emojiIconValue(emoji.emoji))
                              ? "true"
                              : undefined
                          }
                          data-kind="emoji"
                          onClick={() => selectValue(emojiIconValue(emoji.emoji))}
                        >
                          {emoji.emoji}
                        </button>
                      ))}
                      {emojiResults.length === 0 ? (
                        <p className="sc-icon-emoji-picker-empty">No emoji found</p>
                      ) : null}
                    </div>
                  </Tabs.Content>
                </>
              )}
            </Tabs.Root>
          </EditorFloating.Content>
        </EditorFloating.Portal>
      </EditorFloating.Root>
      <FilePickerModal
        open={mediaPickerOpen}
        onOpenChange={setMediaPickerOpen}
        onResolved={handleMediaResolved}
        kind="media"
        allowedMediaTypes={ICON_MEDIA_TYPES}
        defaultMediaType="image"
        title="Choose image icon"
        metadataFields={["alt"]}
        allowExternalUrl={false}
      />
    </>
  );
}
