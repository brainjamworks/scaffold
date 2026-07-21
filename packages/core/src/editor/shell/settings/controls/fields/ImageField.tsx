import { useEffect, useState } from "react";
import { useController, useFormContext, type FieldValues } from "react-hook-form";

import { Button } from "@/ui/components/Button/Button";
import { Field, Input, Label } from "@/ui/components/Input/Input";
import { RadioGroup, RadioItem } from "@/ui/components/Radio/Radio";
import { MediaEmptyAction } from "@/editor/media/authoring/shared-components/MediaEmptyAction";
import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";
import { imagePositionToCss } from "@/editor/media/model/image-position";
import { mediaUnavailableMessage } from "@/editor/media/accessibility/media-accessibility";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import {
  DEFAULT_IMAGE_POSITION,
  ImagePositionSchema,
  type ImagePosition,
} from "@/schemas/course-document";
import { ImageBlockAttrsSchema, type ImageBlockAttrs } from "@scaffold/contracts";

import { SettingsFieldError, SettingsFieldHelp, settingsFieldMeta } from "./shared";
import type { SettingsFieldDescriptorByKind, SettingsFieldProps } from "./types";

import "./settings-field.css";

interface UrlImageFieldValue {
  imageUrl?: string;
  imageAlt?: string;
  imagePosition?: ImagePosition;
  [key: string]: unknown;
}

type ImageFieldDescriptor = SettingsFieldDescriptorByKind<"image">;

export interface ControlledImageFieldProps {
  descriptor: ImageFieldDescriptor;
  error?: string;
  idScope?: string;
  value: unknown;
  onChange: (next: unknown) => void;
}

const IMAGE_POSITION_OPTIONS = [
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top centre" },
  { value: "top-right", label: "Top right" },
  { value: "center-left", label: "Centre left" },
  { value: "center", label: "Centre" },
  { value: "center-right", label: "Centre right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom centre" },
  { value: "bottom-right", label: "Bottom right" },
] as const satisfies readonly { value: ImagePosition; label: string }[];

export function ImageField({ descriptor, error }: SettingsFieldProps<ImageFieldDescriptor>) {
  const form = useFormContext<FieldValues>();
  const { field } = useController({ control: form.control, name: descriptor.name });
  return (
    <ControlledImageField
      descriptor={descriptor}
      {...(error ? { error } : {})}
      value={field.value}
      onChange={field.onChange}
    />
  );
}

export function ControlledImageField({
  descriptor,
  error,
  idScope,
  value: rawValue,
  onChange,
}: ControlledImageFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const disabled = Boolean(descriptor.disabledReason);
  const meta = settingsFieldMeta({
    ...descriptor,
    name: idScope ? `${idScope}.${descriptor.name}` : descriptor.name,
    error,
  });
  const canonicalValue = readCanonicalImageFieldValue(rawValue);
  const urlValue = readUrlImageFieldValue(rawValue);
  const managedPreview = useResolvedManagedImage(canonicalValue);
  const imageUrl =
    descriptor.mediaStorage === "canonical"
      ? canonicalValue?.mode === "external"
        ? canonicalValue.src
        : managedPreview?.url
      : (urlValue.imageUrl ?? null);
  const previewError =
    descriptor.mediaStorage === "canonical" && canonicalValue?.mode === "managed"
      ? (managedPreview?.error ?? null)
      : null;
  const hasImage =
    descriptor.mediaStorage === "canonical" ? canonicalValue !== null : Boolean(imageUrl);
  const imageAlt =
    descriptor.mediaStorage === "canonical"
      ? (canonicalValue?.alt ?? "")
      : (urlValue.imageAlt ?? "");
  const imagePosition = readImagePosition(urlValue.imagePosition);
  const imagePositionLabel =
    IMAGE_POSITION_OPTIONS.find((option) => option.value === imagePosition)?.label ?? "Centre";
  const chooseLabel = descriptor.chooseLabel ?? "Choose image";
  const changeLabel = descriptor.changeLabel ?? "Replace image";
  const removeLabel = descriptor.removeLabel ?? "Remove image";
  const emptyLabel = descriptor.emptyLabel ?? chooseLabel;
  const previewLabel = descriptor.previewLabel ?? "Current image";
  const canPosition = descriptor.positioning === "crop";

  const commitAlt = (alt: string) => {
    if (descriptor.mediaStorage === "canonical") {
      if (!canonicalValue) return;
      onChange({ ...canonicalValue, alt });
      return;
    }
    onChange({ ...urlValue, imageAlt: alt });
  };

  return (
    <Field className="sc-settings-image-field">
      <div className="sc-settings-image-field__header">
        <Label>{descriptor.label}</Label>
        {hasImage ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              onChange(
                descriptor.mediaStorage === "canonical" ? null : removeUrlImageValue(urlValue),
              )
            }
          >
            {removeLabel}
          </Button>
        ) : null}
      </div>

      {hasImage ? (
        <div className="sc-settings-image-preview">
          <div className="sc-settings-image-preview__media">
            {imageUrl ? (
              <img
                alt={imageAlt}
                src={imageUrl}
                className="sc-settings-image-preview__image"
                style={
                  canPosition ? { objectPosition: imagePositionToCss(imagePosition) } : undefined
                }
              />
            ) : previewError ? (
              <div
                className="sc-settings-image-preview__pending sc-settings-image-preview__pending--error"
                role="alert"
              >
                {previewError}
              </div>
            ) : (
              <div className="sc-settings-image-preview__pending" role="status">
                Loading image preview
              </div>
            )}
            {canPosition ? (
              <RadioGroup
                aria-label={`${descriptor.label} position`}
                className="sc-settings-image-position"
                disabled={disabled}
                value={imagePosition}
                onValueChange={(nextValue) => {
                  const parsed = ImagePositionSchema.safeParse(nextValue);
                  if (!parsed.success) return;
                  onChange(setUrlImagePosition(urlValue, parsed.data));
                }}
              >
                {IMAGE_POSITION_OPTIONS.map((option) => (
                  <RadioItem
                    key={option.value}
                    aria-label={option.label}
                    className="sc-settings-image-position__option"
                    title={option.label}
                    value={option.value}
                  />
                ))}
              </RadioGroup>
            ) : null}
          </div>
          <div className="sc-settings-image-preview__copy">
            <span className="sc-settings-image-preview__label">
              {previewLabel}
              {canPosition ? ` · ${imagePositionLabel}` : ""}
            </span>
            {imageUrl ? <span className="sc-settings-image-preview__url">{imageUrl}</span> : null}
          </div>
        </div>
      ) : (
        <MediaEmptyAction
          id={meta.id}
          aria-describedby={meta.describedBy}
          aria-label={emptyLabel}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
          label={emptyLabel}
          className="sc-settings-image-empty"
        />
      )}

      {hasImage ? (
        <div className="sc-settings-image-actions">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => setPickerOpen(true)}
          >
            {changeLabel}
          </Button>
        </div>
      ) : null}

      {hasImage ? (
        <Field>
          <Label htmlFor={`${meta.id}-alt`}>{descriptor.altLabel ?? "Image description"}</Label>
          <Input
            id={`${meta.id}-alt`}
            value={imageAlt}
            placeholder={descriptor.altPlaceholder ?? "Optional image description"}
            disabled={disabled}
            onChange={(event) => commitAlt(event.target.value)}
          />
        </Field>
      ) : null}

      <SettingsFieldHelp
        description={descriptor.description}
        disabledReason={descriptor.disabledReason}
        disabledHint={descriptor.disabledHint}
        id={meta.helpId}
      />
      <SettingsFieldError error={error} id={meta.errorId} />

      <FilePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="media"
        defaultMediaType="image"
        title={descriptor.pickerTitle ?? (hasImage ? changeLabel : chooseLabel)}
        onResolved={(result) => {
          if (descriptor.mediaStorage === "canonical") {
            const next = resolveCanonicalImagePick(result);
            if (!next) return;
            onChange(next);
          } else {
            const next = resolveUrlImagePick(result);
            if (!next) return;
            onChange(replaceUrlImageValue(urlValue, next));
          }
          setPickerOpen(false);
        }}
      />
    </Field>
  );
}

interface ManagedImagePreview {
  mediaId: string;
  url: string | null;
  error: string | null;
}

function useResolvedManagedImage(value: ImageBlockAttrs | null): ManagedImagePreview | null {
  const mediaPort = useMediaPort();
  const mediaId = value?.mode === "managed" ? value.mediaId : null;
  const [resolved, setResolved] = useState<ManagedImagePreview | null>(null);

  useEffect(() => {
    if (!mediaId) return;
    if (!mediaPort) {
      setResolved({ mediaId, url: null, error: mediaUnavailableMessage("image") });
      return;
    }
    let active = true;
    void mediaPort.resolve(mediaId).then(
      (url) => {
        if (active) setResolved({ mediaId, url, error: null });
      },
      (error: unknown) => {
        if (!active) return;
        setResolved({
          mediaId,
          url: null,
          error:
            error instanceof Error && error.message
              ? error.message
              : mediaUnavailableMessage("image"),
        });
      },
    );
    return () => {
      active = false;
    };
  }, [mediaId, mediaPort]);

  return mediaId && resolved?.mediaId === mediaId ? resolved : null;
}

function readCanonicalImageFieldValue(value: unknown): ImageBlockAttrs | null {
  const parsed = ImageBlockAttrsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function readUrlImageFieldValue(value: unknown): UrlImageFieldValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UrlImageFieldValue)
    : {};
}

function removeUrlImageValue(value: UrlImageFieldValue): UrlImageFieldValue | undefined {
  const {
    imageUrl: _imageUrl,
    imageAlt: _imageAlt,
    imagePosition: _imagePosition,
    ...rest
  } = value;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function replaceUrlImageValue(
  value: UrlImageFieldValue,
  next: Pick<UrlImageFieldValue, "imageUrl" | "imageAlt">,
): UrlImageFieldValue {
  const { imagePosition: _imagePosition, ...rest } = value;
  return { ...rest, ...next };
}

function setUrlImagePosition(
  value: UrlImageFieldValue,
  imagePosition: ImagePosition,
): UrlImageFieldValue {
  const { imagePosition: _currentPosition, ...rest } = value;
  return imagePosition === DEFAULT_IMAGE_POSITION ? rest : { ...rest, imagePosition };
}

function readImagePosition(value: unknown): ImagePosition {
  const parsed = ImagePositionSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_IMAGE_POSITION;
}

function resolveCanonicalImagePick(result: FilePickerResult): ImageBlockAttrs | null {
  if (result.source === "upload" && result.upload) {
    return {
      mode: "managed",
      mediaId: result.upload.id,
      ...(result.alt ? { alt: result.alt } : {}),
    };
  }
  if (result.source === "browse" && result.browse) {
    return {
      mode: "managed",
      mediaId: result.browse.id,
      ...(result.alt ? { alt: result.alt } : {}),
    };
  }
  if (result.source === "url" && result.url) {
    const parsed = ImageBlockAttrsSchema.safeParse({
      mode: "external",
      src: result.url,
      ...(result.alt ? { alt: result.alt } : {}),
    });
    return parsed.success ? parsed.data : null;
  }
  return null;
}

function resolveUrlImagePick(
  result: FilePickerResult,
): Pick<UrlImageFieldValue, "imageUrl" | "imageAlt"> | null {
  const imageUrl =
    result.source === "upload"
      ? result.upload?.url
      : result.source === "browse"
        ? result.browse?.url
        : result.url;
  if (!imageUrl) return null;
  return { imageUrl, ...(result.alt ? { imageAlt: result.alt } : {}) };
}
