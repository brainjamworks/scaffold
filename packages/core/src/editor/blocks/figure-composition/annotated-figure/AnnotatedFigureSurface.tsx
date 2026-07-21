import { ImageIcon as ImagePlaceholder, XIcon as X } from "@phosphor-icons/react";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";

import type { AnnotatedFigureData } from "@scaffold/contracts";

import type { AnnotatedFigureAnnotationProjection } from "./annotated-figure-document-model";

import {
  mediaLoadingMessage,
  mediaMissingMessage,
} from "@/editor/media/accessibility/media-accessibility";
import { resolveMediaFitSize, type MediaFitSize } from "@/editor/media/model/media-fit-size";

interface AnnotatedFigureNaturalSize {
  height: number;
  source: string;
  width: number;
}

interface AnnotatedFigureFitSize extends MediaFitSize {
  source: string;
}

export function AnnotatedFigureSurface({
  data,
  annotations,
  errorMessage,
  emptyAction,
  expandAction,
  fileUrl,
  draggingPinId,
  stageRef,
  onActivatePin,
  onPinPointerCancel,
  onPinPointerDown,
  onPinPointerMove,
  onPinPointerUp,
  onRemovePin,
  onStageClick,
  pinActivationLabel,
  presentation = "compact",
  renderPinActivator,
}: {
  data: AnnotatedFigureData;
  annotations: readonly Pick<AnnotatedFigureAnnotationProjection, "id" | "number" | "x" | "y">[];
  errorMessage?: string | null;
  emptyAction?: ReactNode;
  expandAction?: ReactNode;
  fileUrl: string | null;
  draggingPinId?: string | null;
  stageRef?: RefObject<HTMLDivElement | null>;
  onActivatePin?: (pinId: string) => void;
  onPinPointerCancel?: (pinId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPinPointerDown?: (pinId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPinPointerMove?: (pinId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPinPointerUp?: (pinId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onRemovePin?: (pinId: string) => void;
  onStageClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  pinActivationLabel?: (
    annotation: Pick<AnnotatedFigureAnnotationProjection, "id" | "number" | "x" | "y">,
  ) => string;
  presentation?: "compact" | "lightbox" | "workspace";
  renderPinActivator?: (
    annotation: Pick<AnnotatedFigureAnnotationProjection, "id" | "number" | "x" | "y">,
    activator: ReactElement,
  ) => ReactNode;
}) {
  const hasSource = data.source !== null;
  const fitStageRef = useRef<HTMLDivElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<AnnotatedFigureNaturalSize | null>(null);
  const [fitSize, setFitSize] = useState<AnnotatedFigureFitSize | null>(null);
  const activeNaturalSize = naturalSize?.source === fileUrl ? naturalSize : null;
  const activeFitSize = fitSize?.source === fileUrl ? fitSize : null;
  const canvasStyle = useMemo(
    () =>
      ({
        ...(activeNaturalSize
          ? { aspectRatio: activeNaturalSize.width / activeNaturalSize.height }
          : {}),
        ...(activeFitSize
          ? {
              height: `${activeFitSize.height}px`,
              width: `${activeFitSize.width}px`,
            }
          : {}),
      }) as CSSProperties,
    [activeFitSize, activeNaturalSize],
  );

  useLayoutEffect(() => {
    const fitStage = fitStageRef.current;
    if (!fileUrl || !fitStage || !activeNaturalSize) {
      setFitSize(null);
      return undefined;
    }

    const updateFitSize = () => {
      const fitStageStyle = getComputedStyle(fitStage);
      const nextSize = resolveMediaFitSize({
        availableHeight:
          fitStage.clientHeight -
          Number.parseFloat(fitStageStyle.paddingTop) -
          Number.parseFloat(fitStageStyle.paddingBottom),
        availableWidth:
          fitStage.clientWidth -
          Number.parseFloat(fitStageStyle.paddingLeft) -
          Number.parseFloat(fitStageStyle.paddingRight),
        intrinsicHeight: activeNaturalSize.height,
        intrinsicWidth: activeNaturalSize.width,
        strategy: "contain",
      });
      setFitSize((current) => {
        if (!nextSize) return null;
        if (
          current &&
          current.source === fileUrl &&
          Math.abs(current.width - nextSize.width) < 0.5 &&
          Math.abs(current.height - nextSize.height) < 0.5
        ) {
          return current;
        }
        return { ...nextSize, source: fileUrl };
      });
    };

    updateFitSize();
    if (typeof ResizeObserver === "undefined") return undefined;

    const resizeObserver = new ResizeObserver(updateFitSize);
    resizeObserver.observe(fitStage);
    return () => resizeObserver.disconnect();
  }, [activeNaturalSize, fileUrl]);

  return (
    <div
      ref={fitStageRef}
      className="sc-annotated-figure__stage"
      data-presentation={presentation}
      role="group"
      aria-label="Annotated figure image"
      contentEditable={false}
    >
      {errorMessage ? (
        <div className="sc-annotated-figure__empty" role="alert">
          <ImagePlaceholder size={20} weight="regular" aria-hidden />
          <span>{errorMessage}</span>
        </div>
      ) : fileUrl ? (
        <div
          ref={stageRef}
          className="sc-annotated-figure__canvas"
          data-media-fit-ready={activeFitSize ? "true" : "false"}
          onClick={onStageClick}
          style={canvasStyle}
          tabIndex={-1}
        >
          <img
            src={fileUrl}
            alt={data.alt}
            className="sc-annotated-figure__img"
            draggable={false}
            onLoad={(event) => {
              setFitSize(null);
              setNaturalSize({
                height: event.currentTarget.naturalHeight,
                source: fileUrl,
                width: event.currentTarget.naturalWidth,
              });
            }}
          />

          {annotations.map((annotation) => (
            <AnnotatedFigurePinMarker
              key={annotation.id}
              annotation={annotation}
              isDragging={draggingPinId === annotation.id}
              {...(pinActivationLabel ? { activationLabel: pinActivationLabel(annotation) } : {})}
              {...(renderPinActivator ? { renderActivator: renderPinActivator } : {})}
              {...(onActivatePin ? { onActivate: () => onActivatePin(annotation.id) } : {})}
              {...(onPinPointerCancel
                ? {
                    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) =>
                      onPinPointerCancel(annotation.id, event),
                  }
                : {})}
              {...(onPinPointerDown
                ? {
                    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) =>
                      onPinPointerDown(annotation.id, event),
                  }
                : {})}
              {...(onPinPointerMove
                ? {
                    onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) =>
                      onPinPointerMove(annotation.id, event),
                  }
                : {})}
              {...(onPinPointerUp
                ? {
                    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) =>
                      onPinPointerUp(annotation.id, event),
                  }
                : {})}
              {...(onRemovePin ? { onRemove: () => onRemovePin(annotation.id) } : {})}
            />
          ))}

          {expandAction ? (
            <div
              className="sc-annotated-figure__image-actions"
              role="group"
              aria-label="Annotated figure image actions"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {expandAction}
            </div>
          ) : null}
        </div>
      ) : hasSource ? (
        <div className="sc-annotated-figure__empty" role="status">
          <ImagePlaceholder size={20} weight="regular" aria-hidden />
          <span>{mediaLoadingMessage("image")}</span>
        </div>
      ) : emptyAction ? (
        emptyAction
      ) : (
        <div className="sc-annotated-figure__empty" role="status">
          <ImagePlaceholder size={20} weight="regular" aria-hidden />
          <span>{mediaMissingMessage("image")}</span>
        </div>
      )}
    </div>
  );
}

function AnnotatedFigurePinMarker({
  annotation,
  activationLabel,
  isDragging,
  onActivate,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onRemove,
  renderActivator,
}: {
  annotation: Pick<AnnotatedFigureAnnotationProjection, "id" | "number" | "x" | "y">;
  activationLabel?: string;
  isDragging: boolean;
  onActivate?: () => void;
  onPointerCancel?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onRemove?: () => void;
  renderActivator?: (
    annotation: Pick<AnnotatedFigureAnnotationProjection, "id" | "number" | "x" | "y">,
    activator: ReactElement,
  ) => ReactNode;
}) {
  const activator = onActivate ? (
    <button
      type="button"
      className="sc-annotated-figure__pin-activate"
      aria-label={activationLabel ?? `Select annotation ${annotation.number}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
    >
      <span className="sc-annotated-figure__pin-number">{annotation.number}</span>
    </button>
  ) : null;

  return (
    <div
      data-pin={annotation.id}
      data-dragging={isDragging ? "true" : "false"}
      style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
      className="sc-annotated-figure__pin"
    >
      {activator ? (
        renderActivator ? (
          renderActivator(annotation, activator)
        ) : (
          activator
        )
      ) : (
        <span className="sc-annotated-figure__pin-number">{annotation.number}</span>
      )}
      {onRemove ? (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove pin ${annotation.number}`}
          className="sc-annotated-figure__pin-remove"
        >
          <X size={9} weight="bold" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
