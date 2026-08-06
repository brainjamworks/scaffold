import {
  CaretDownIcon as CaretDown,
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  LightbulbIcon as Lightbulb,
} from "@phosphor-icons/react";
import {
  useRef,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type RefObject,
  type RefAttributes,
} from "react";
import { flushSync } from "react-dom";

import * as Popover from "@/ui/components/Popover/Popover";
import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";
import { iconSm, iconXs } from "@/ui/tokens/icon-sizes";
import { AssessmentSupportButton } from "@/ui/components/course/AssessmentSupportButton/AssessmentSupportButton";

import { AssessmentRuntimePopoverShell } from "./AssessmentRuntimePopoverShell";
import "./assessment-hints.css";

export interface HintsAuthorPopoverRenderProps {
  activeIndex: number;
  contentRef: RefObject<HTMLDivElement | null>;
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
  const pendingPagerFocusRef = useRef<"next" | "previous" | null>(null);

  const revealedHints = isEditable ? hintsTotal : hintsShown;
  const hasVisibleHints = revealedHints > 0;
  const pagerTotal = hintsTotal;
  const visibleActiveIndex = revealedHints > 0 ? Math.min(activeIndex, revealedHints - 1) : 0;
  const hasMoreRuntimeHints = !isEditable && !submitted && hintsShown < hintsTotal;
  const runtimeHintsVisible = !isEditable && !submitted && hintsShown > 0;

  const goToPreviousHint = () => {
    const nextIndex = Math.max(0, visibleActiveIndex - 1);
    pendingPagerFocusRef.current = nextIndex === 0 ? "next" : "previous";
    setActiveIndex(nextIndex);
  };

  const goToNextHint = () => {
    if (!isEditable) {
      if (visibleActiveIndex < hintsShown - 1) {
        const nextIndex = visibleActiveIndex + 1;
        pendingPagerFocusRef.current = nextIndex >= pagerTotal - 1 ? "previous" : "next";
        setActiveIndex(nextIndex);
        return;
      }
      if (hintsShown < hintsTotal) {
        pendingPagerFocusRef.current = hintsShown >= pagerTotal - 1 ? "previous" : "next";
        setActiveIndex(hintsShown);
        onReveal();
      }
      return;
    }

    const nextIndex = pagerTotal > 0 ? Math.min(pagerTotal - 1, visibleActiveIndex + 1) : 0;
    pendingPagerFocusRef.current = nextIndex >= pagerTotal - 1 ? "previous" : "next";
    setActiveIndex(nextIndex);
  };

  useLayoutEffect(() => {
    const preferred = pendingPagerFocusRef.current;
    const root = contentRef.current;
    if (!preferred || !root || !open) return;

    const labels =
      preferred === "next" ? ["Next hint", "Previous hint"] : ["Previous hint", "Next hint"];
    const target = labels
      .map((label) => root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`))
      .find((button) => button && !button.disabled);

    if (!target) return;
    pendingPagerFocusRef.current = null;
    target.focus();
  }, [hintsShown, open, revealedHints, visibleActiveIndex]);

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
            <AssessmentSupportButton
              intent="hint"
              icon={<Lightbulb size={iconSm} weight="fill" />}
              endIcon={hasVisibleHints ? <CaretDown size={iconXs} weight="bold" /> : undefined}
              expanded={open}
              onClick={onTriggerClick}
              disabled={!isEditable && !hasMoreRuntimeHints && hintsShown === 0}
            >
              {label}
            </AssessmentSupportButton>
          </HintPopover.Trigger>
          {isEditable ? (
            renderAuthorPopover?.({
              activeIndex: visibleActiveIndex,
              contentRef,
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
                className="sc-course-assessment-hint-popover sc-course-assessment-hint-popover--runtime"
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
                  <HintPopoverBody
                    activeIndex={visibleActiveIndex}
                    hidden={!runtimeHintsVisible}
                    trackStyle={trackStyle}
                  >
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
  activeIndex: number;
  children: ReactNode;
  hidden: boolean;
  trackStyle: CSSProperties;
}

function HintPopoverBody({ activeIndex, children, hidden, trackStyle }: HintPopoverBodyProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const hints = listRef.current?.querySelectorAll<HTMLElement>('[data-slot="assessment-hint"]');
    hints?.forEach((hint, index) => {
      const inactive = index !== activeIndex;
      if (inactive) {
        hint.setAttribute("aria-hidden", "true");
      } else {
        hint.removeAttribute("aria-hidden");
      }
      hint.inert = inactive;
    });
  }, [activeIndex, children]);

  return (
    <div
      ref={listRef}
      className={cn("sc-assessment-hints__list", hidden && "is-hidden")}
      aria-live="polite"
      aria-atomic="true"
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
      className="sc-course-assessment-hint-pager"
      aria-label="Hint navigation"
      contentEditable={false}
    >
      <button
        type="button"
        className="sc-course-assessment-hint-pager__button"
        onClick={onPrevious}
        disabled={activeIndex === 0}
        aria-label="Previous hint"
      >
        <CaretLeft size={iconXs} weight="bold" aria-hidden />
      </button>
      <span className="sc-course-assessment-hint-pager__count">
        {activeIndex + 1} / {total}
      </span>
      <button
        type="button"
        className="sc-course-assessment-hint-pager__button"
        onClick={onNext}
        disabled={activeIndex >= total - 1}
        aria-label="Next hint"
      >
        <CaretRight size={iconXs} weight="bold" aria-hidden />
      </button>
    </div>
  );
}
