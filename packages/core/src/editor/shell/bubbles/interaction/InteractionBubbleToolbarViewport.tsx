import { CaretLeftIcon as CaretLeft, CaretRightIcon as CaretRight } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";

import { IconButton } from "@/ui/components/IconButton/IconButton";
import { cn } from "@/lib/cn";
import { iconSm } from "@/ui/tokens/icon-sizes";

import "./interaction-bubble-toolbar-viewport.css";

interface ToolbarOverflowState {
  canScrollBackward: boolean;
  canScrollForward: boolean;
  hasOverflow: boolean;
}

const NO_OVERFLOW: ToolbarOverflowState = {
  canScrollBackward: false,
  canScrollForward: false,
  hasOverflow: false,
};

export type InteractionBubbleToolbarViewportProps = ComponentPropsWithoutRef<"div">;

export function InteractionBubbleToolbarViewport({
  children,
  className,
  id,
  ...toolbarProps
}: InteractionBubbleToolbarViewportProps) {
  const generatedId = useId();
  const toolbarId = id ?? `sc-bubble-toolbar-${generatedId.replaceAll(":", "")}`;
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<ToolbarOverflowState>(NO_OVERFLOW);

  const updateOverflow = useCallback(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const maximumScroll = Math.max(0, toolbar.scrollWidth - toolbar.clientWidth);
    const next = {
      canScrollBackward: toolbar.scrollLeft > 1,
      canScrollForward: toolbar.scrollLeft < maximumScroll - 1,
      hasOverflow: maximumScroll > 1,
    };

    setOverflow((current) =>
      current.canScrollBackward === next.canScrollBackward &&
      current.canScrollForward === next.canScrollForward &&
      current.hasOverflow === next.hasOverflow
        ? current
        : next,
    );
  }, []);

  useLayoutEffect(updateOverflow);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    const view = toolbar?.ownerDocument.defaultView;
    if (!toolbar || !view) return;

    const resizeObserver =
      "ResizeObserver" in view ? new view.ResizeObserver(updateOverflow) : null;
    resizeObserver?.observe(toolbar);
    for (const child of toolbar.children) resizeObserver?.observe(child);

    toolbar.addEventListener("scroll", updateOverflow);
    view.addEventListener("resize", updateOverflow);

    return () => {
      resizeObserver?.disconnect();
      toolbar.removeEventListener("scroll", updateOverflow);
      view.removeEventListener("resize", updateOverflow);
    };
  }, [updateOverflow]);

  const scrollToolbar = useCallback(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    if (overflow.canScrollForward) {
      toolbar.scrollBy({
        behavior: "auto",
        left: Math.max(72, Math.floor(toolbar.clientWidth * 0.65)),
      });
      return;
    }

    toolbar.scrollTo({ behavior: "auto", left: 0 });
  }, [overflow.canScrollForward]);

  const scrollsForward = overflow.canScrollForward || !overflow.canScrollBackward;

  return (
    <div
      contentEditable={false}
      className="sc-bubble-toolbar-frame"
      data-scaffold-bubble-toolbar-frame
      data-overflow={overflow.hasOverflow ? "true" : "false"}
    >
      <div
        ref={toolbarRef}
        id={toolbarId}
        className={cn("sc-bubble-toolbar-scrollport", className)}
        {...toolbarProps}
      >
        {children}
      </div>
      {overflow.hasOverflow ? (
        <IconButton
          aria-controls={toolbarId}
          aria-label={scrollsForward ? "Show more actions" : "Show first actions"}
          className="sc-bubble-toolbar-scroll-button"
          data-scaffold-bubble-scroll-button
          onClick={scrollToolbar}
          onMouseDown={(event) => event.preventDefault()}
          size="md"
          variant="ghost"
        >
          {scrollsForward ? (
            <CaretRight size={iconSm} weight="bold" aria-hidden="true" />
          ) : (
            <CaretLeft size={iconSm} weight="bold" aria-hidden="true" />
          )}
        </IconButton>
      ) : null}
    </div>
  );
}
