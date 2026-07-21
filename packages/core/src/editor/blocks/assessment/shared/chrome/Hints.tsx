import {
  CaretDownIcon as CaretDown,
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  LightbulbIcon as Lightbulb,
} from "@phosphor-icons/react";
import {
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type RefAttributes,
} from "react";
import { flushSync } from "react-dom";

import * as Popover from "@/ui/components/Popover/Popover";
import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";
import { iconSm, iconXs } from "@/ui/tokens/icon-sizes";

import { AssessmentRuntimePopoverShell } from "./AssessmentRuntimePopoverShell";
import "./assessment-hints.css";

export interface HintsAuthorPopoverRenderProps {
  activeIndex: number;
  hasVisibleHints: boolean;
  onAddHint: () => void;
  onDeleteHint: () => void;
  onNext: () => void;
  onPrevious: () => void;
  total: number;
}

interface HintsPopoverRootProps {
  children?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

interface HintsPopoverTriggerProps {
  asChild?: boolean;
  children?: ReactNode;
}

interface HintsPopoverPortalProps {
  children?: ReactNode;
}

interface HintsPopoverContentProps {
  align?: "center" | "end" | "start";
  children?: ReactNode;
  className?: string;
  contentEditable?: boolean;
  onOpenAutoFocus?: (event: { preventDefault: () => void }) => void;
  role?: string;
  side?: "bottom" | "left" | "right" | "top";
  sideOffset?: number;
  style?: CSSProperties;
  "aria-label"?: string;
}

export interface HintsPopoverPrimitive {
  Content: ElementType<HintsPopoverContentProps & RefAttributes<HTMLDivElement>>;
  Portal: ElementType<HintsPopoverPortalProps>;
  Root: ElementType<HintsPopoverRootProps>;
  Trigger: ElementType<HintsPopoverTriggerProps>;
}

interface HintsProps {
  /** Total hint count. */
  hintsTotal: number;
  /** Author mode. */
  isEditable: boolean;
  /** Runtime: how many have been revealed so far. Author ignores. */
  hintsShown: number;
  /** Runtime: answer-mode only. Submitted review mode hides hint affordances. */
  submitted: boolean;
  /** Runtime: bumps the reveal counter. Author ignores. */
  onReveal: () => void;
  /** Author: "+ Add hint" handler. Runtime ignores. */
  onAddHint: () => void;
  /** Author: deletes the active 0-based hint. Runtime ignores. */
  onDeleteHint?: (index: number) => void;
  renderAuthorPopover?: (props: HintsAuthorPopoverRenderProps) => ReactNode;
  /** Authoring can provide editor-owned floating chrome while runtime stays platform-neutral. */
  popover?: HintsPopoverPrimitive;
  /** Runtime hint list slot: NodeViewContent. */
  children: ReactNode;
}

/**
 * Shared hint chrome. Authoring and runtime use the same trigger,
 * popover, pager, and lightbulb treatment; `isEditable` only gates the
 * authoring editor actions versus learner reveal behavior.
 */
export function Hints({
  children,
  hintsTotal,
  hintsShown,
  isEditable,
  submitted,
  onAddHint,
  onDeleteHint,
  onReveal,
  popover: HintPopover = Popover,
  renderAuthorPopover,
}: HintsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const revealedHints = isEditable ? hintsTotal : hintsShown;
  const hasVisibleHints = revealedHints > 0;
  const pagerTotal = hintsTotal;
  const visibleActiveIndex = revealedHints > 0 ? Math.min(activeIndex, revealedHints - 1) : 0;
  const hasMoreRuntimeHints = !isEditable && !submitted && hintsShown < hintsTotal;
  const runtimeHintsVisible = !isEditable && !submitted && hintsShown > 0;

  const goToPreviousHint = () => {
    setActiveIndex(Math.max(0, visibleActiveIndex - 1));
  };

  const goToNextHint = () => {
    if (!isEditable) {
      if (visibleActiveIndex < hintsShown - 1) {
        setActiveIndex(visibleActiveIndex + 1);
        return;
      }
      if (hintsShown < hintsTotal) {
        setActiveIndex(hintsShown);
        onReveal();
      }
      return;
    }

    setActiveIndex(pagerTotal > 0 ? Math.min(pagerTotal - 1, visibleActiveIndex + 1) : 0);
  };

  const addHint = () => {
    setActiveIndex(hintsTotal);
    onAddHint();
    setOpen(true);
  };

  const deleteActiveHint = () => {
    if (revealedHints <= 1) {
      flushSync(() => setOpen(false));
      onDeleteHint?.(visibleActiveIndex);
      setActiveIndex(0);
      return;
    }
    onDeleteHint?.(visibleActiveIndex);
    setActiveIndex((current) => Math.max(0, Math.min(current, revealedHints - 2)));
    setOpen(true);
  };

  const onTriggerClick = (event: { preventDefault: () => void }) => {
    if (isEditable) {
      if (hintsTotal === 0) {
        event.preventDefault();
        addHint();
      }
      return;
    }

    if (hasMoreRuntimeHints) {
      event.preventDefault();
      setActiveIndex(hintsShown);
      onReveal();
      setOpen(true);
    }
  };

  const trackStyle = {
    transform: `translate3d(-${visibleActiveIndex * 100}%, 0, 0)`,
  } satisfies CSSProperties;
  if (!isEditable && (hintsTotal === 0 || submitted)) return null;

  const label = (() => {
    if (isEditable) {
      if (hintsTotal === 0) return "Add hint";
      const noun = hintsTotal === 1 ? "hint" : "hints";
      return open ? `Hide ${hintsTotal} ${noun}` : `Edit ${hintsTotal} ${noun}`;
    }
    if (hasMoreRuntimeHints) {
      return hintsShown === 0 ? "Show a hint" : "Show next hint";
    }
    if (hintsShown > 0) {
      const noun = hintsShown === 1 ? "hint" : "hints";
      return open ? `Hide ${hintsShown} ${noun}` : `Show ${hintsShown} ${noun}`;
    }
    return "No more hints";
  })();

  return (
    <div
      className={cn(
        "sc-assessment-hints",
        isEditable ? "sc-assessment-hints--author" : "sc-assessment-hints--runtime",
      )}
    >
      <div className="sc-assessment-hints__bar">
        <HintPopover.Root open={open} onOpenChange={setOpen}>
          <HintPopover.Trigger asChild>
            <button
              type="button"
              onClick={onTriggerClick}
              disabled={!isEditable && !hasMoreRuntimeHints && hintsShown === 0}
              className="sc-assessment-hints__toggle"
              aria-expanded={open}
            >
              <Lightbulb size={iconSm} weight="fill" aria-hidden />
              <span>{label}</span>
              {hasVisibleHints && (
                <CaretDown
                  size={iconXs}
                  weight="bold"
                  className={cn("sc-assessment-hints__toggle-caret", open && "is-expanded")}
                  aria-hidden
                />
              )}
            </button>
          </HintPopover.Trigger>
          {isEditable ? (
            renderAuthorPopover?.({
              activeIndex: visibleActiveIndex,
              hasVisibleHints,
              onAddHint: addHint,
              onDeleteHint: deleteActiveHint,
              onNext: goToNextHint,
              onPrevious: goToPreviousHint,
              total: pagerTotal,
            })
          ) : (
            <HintPopover.Portal>
              <HintPopover.Content
                ref={contentRef}
                role="dialog"
                aria-label={
                  hasVisibleHints ? `Hint ${visibleActiveIndex + 1} of ${pagerTotal}` : "Hints"
                }
                contentEditable={false}
                side="top"
                align="start"
                sideOffset={8}
                className="sc-assessment-hint-popover sc-assessment-hint-popover--runtime"
                style={{ zIndex: zIndex.popover }}
              >
                <AssessmentRuntimePopoverShell
                  headerActions={
                    pagerTotal > 1 ? (
                      <HintCarouselPager
                        activeIndex={visibleActiveIndex}
                        total={pagerTotal}
                        onPrevious={goToPreviousHint}
                        onNext={goToNextHint}
                      />
                    ) : null
                  }
                  icon={<Lightbulb size={iconSm} weight="fill" />}
                  title={`Hint ${visibleActiveIndex + 1}`}
                  tone="hint"
                >
                  <HintPopoverBody hidden={!runtimeHintsVisible} trackStyle={trackStyle}>
                    {children}
                  </HintPopoverBody>
                </AssessmentRuntimePopoverShell>
              </HintPopover.Content>
            </HintPopover.Portal>
          )}
        </HintPopover.Root>
      </div>
    </div>
  );
}

interface HintPopoverBodyProps {
  children: ReactNode;
  hidden: boolean;
  trackStyle: CSSProperties;
}

function HintPopoverBody({ children, hidden, trackStyle }: HintPopoverBodyProps) {
  return (
    <div
      className={cn("sc-assessment-hints__list", hidden && "is-hidden")}
      aria-live="polite"
      aria-atomic="false"
      aria-roledescription="carousel"
      aria-label="Revealed hints"
    >
      <div className="sc-assessment-hints__track" style={trackStyle}>
        {children}
      </div>
    </div>
  );
}

interface HintCarouselPagerProps {
  activeIndex: number;
  total: number;
  onNext: () => void;
  onPrevious: () => void;
}

function HintCarouselPager({ activeIndex, total, onNext, onPrevious }: HintCarouselPagerProps) {
  return (
    <div
      className="sc-assessment-hints__pager"
      aria-label="Hint navigation"
      contentEditable={false}
    >
      <button
        type="button"
        className="sc-assessment-hints__pager-button"
        onClick={onPrevious}
        disabled={activeIndex === 0}
        aria-label="Previous hint"
      >
        <CaretLeft size={iconXs} weight="bold" aria-hidden />
      </button>
      <span className="sc-assessment-hints__pager-count">
        {activeIndex + 1} / {total}
      </span>
      <button
        type="button"
        className="sc-assessment-hints__pager-button"
        onClick={onNext}
        disabled={activeIndex >= total - 1}
        aria-label="Next hint"
      >
        <CaretRight size={iconXs} weight="bold" aria-hidden />
      </button>
    </div>
  );
}
