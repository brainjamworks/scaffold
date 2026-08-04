import type {
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
} from "react";
import { useEffect, useRef } from "react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { Badge, Button, IconButton, Progress } from "@radix-ui/themes";
import {
  ArrowLeftIcon as ArrowLeft,
  ArrowRightIcon as ArrowRight,
  ArrowsClockwiseIcon as FlipIcon,
  ArrowsCounterClockwiseIcon as ResetIcon,
  CheckIcon as Check,
  TrophyIcon as Trophy,
  XIcon as Cross,
} from "@phosphor-icons/react";

import { CONTAINED_MOVEMENT_TARGET_ATTR } from "@/editor/drag/view/movement-dom";
import { cn } from "@/lib/cn";

import type {
  FlashcardActivityData,
  FlashcardCardSummary,
  FlashcardDeckViewState,
  FlashcardMasteryStatus,
} from "./flashcard-shared";
import {
  shouldIgnoreFlashcardEnterFlip,
  shouldIgnoreFlashcardPointerFlip,
} from "./flashcard-shared";

import "./flashcard.css";

export interface FlashcardDeckController extends FlashcardDeckViewState {
  deck: FlashcardActivityData;
  cardSummaries: FlashcardCardSummary[];
  resetDeck: () => void;
  setCurrentCard: (cardId: string | null | undefined) => void;
  flipCurrent: () => void;
  goNext: () => void;
  goPrev: () => void;
  rateCurrent: (status: FlashcardMasteryStatus) => void;
  handleKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}

export interface FlashcardCardController {
  flipped: boolean;
  mastery: FlashcardMasteryStatus | undefined;
  isCurrent: boolean;
  flip: () => void;
}

export function FlashcardCardView({
  editable,
  cardId,
  controller,
  authoringChrome,
  mountSurface = controller.isCurrent,
}: {
  editable: boolean;
  cardId: string;
  controller: FlashcardCardController;
  authoringChrome?: ReactNode;
  mountSurface?: boolean;
}) {
  const movementAttributes = authoringChrome
    ? { [CONTAINED_MOVEMENT_TARGET_ATTR]: "" }
    : {};

  if (!mountSurface) {
    return (
      <NodeViewWrapper
        data-node="flashcard-card"
        data-id={cardId}
        className="sc-course-flashcard-card--inactive"
      >
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      data-node="flashcard-card"
      data-id={cardId}
      data-flashcard-flipped={controller.flipped ? "true" : "false"}
      data-flashcard-mastery={controller.mastery ?? "unrated"}
      className={cn(
        "sc-course-flashcard-card",
        !controller.isCurrent && "sc-course-flashcard-card--inactive",
      )}
      {...movementAttributes}
    >
      {authoringChrome}
      <FlashcardCardSurface
        flipped={controller.flipped}
        mastery={controller.mastery}
        editable={editable}
        onFlip={controller.flip}
      >
        <NodeViewContent className="sc-course-flashcard-content" />
      </FlashcardCardSurface>
    </NodeViewWrapper>
  );
}

export function CardStack({ children }: { children: ReactNode }) {
  return <div className="sc-course-flashcard-stack">{children}</div>;
}

function LearnerDeckHeader({
  mastered,
  total,
  currentIndex,
}: {
  mastered: number;
  total: number;
  currentIndex: number;
}) {
  if (total === 0) return null;
  const status =
    mastered === 0
      ? "Flip to study, rate as you go"
      : mastered === total
        ? "Deck complete"
        : `${mastered} of ${total} mastered`;

  return (
    <div className="sc-course-flashcard-deck-header">
      <div className="sc-course-flashcard-deck-header__row" aria-hidden>
        <span className="sc-course-flashcard-deck-header__status">{status}</span>
        <DeckCounter currentIndex={currentIndex} total={total} />
      </div>
      <Progress
        value={mastered}
        max={total}
        radius="full"
        aria-label={`${mastered} of ${total} cards mastered`}
        className="sc-course-flashcard-deck-header__progress"
      />
      <span className="sc-sr-only" aria-live="polite" aria-atomic="true">
        Card {currentIndex + 1} of {total}. {status}.
      </span>
    </div>
  );
}

function AuthoringDeckHeader({ total, currentIndex }: { total: number; currentIndex: number }) {
  if (total === 0) return null;
  return (
    <div className="sc-course-flashcard-deck-header" data-flashcard-authoring-header="">
      <div className="sc-course-flashcard-deck-header__row">
        <span className="sc-course-flashcard-deck-header__status">Editing card</span>
        <DeckCounter currentIndex={currentIndex} total={total} />
      </div>
    </div>
  );
}

function DeckCounter({ currentIndex, total }: { currentIndex: number; total: number }) {
  return (
    <span className="sc-course-flashcard-deck-header__counter">
      {String(currentIndex + 1).padStart(String(total).length, "0")} / {total}
    </span>
  );
}

export function ReaderControls({
  flipped,
  mastery,
  onFlip,
  onPrev,
  onNext,
  onRate,
  onReset,
  canNavigate,
  masteredCount,
}: {
  flipped: boolean;
  mastery: FlashcardMasteryStatus | undefined;
  onFlip: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRate: (status: FlashcardMasteryStatus) => void;
  onReset: () => void;
  canNavigate: boolean;
  masteredCount: number;
}) {
  return (
    <div className="sc-course-flashcard-reader-controls">
      <NavigationControls
        flipped={flipped}
        onFlip={onFlip}
        onPrev={onPrev}
        onNext={onNext}
        canNavigate={canNavigate}
        showKeycaps
      />
      <div className="sc-course-flashcard-reader-controls__ratings">
        <RatingButton
          status="notYet"
          active={mastery === "notYet"}
          onClick={() => onRate("notYet")}
        />
        <RatingButton status="gotIt" active={mastery === "gotIt"} onClick={() => onRate("gotIt")} />
      </div>
      {masteredCount > 0 ? (
        <div className="sc-course-flashcard-reader-controls__reset-row">
          <Button
            type="button"
            variant="ghost"
            radius="full"
            onClick={onReset}
            className="sc-course-flashcard-reader-controls__reset-button"
          >
            <ResetIcon size={14} weight="bold" aria-hidden />
            Reset deck
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function NavigationControls({
  flipped,
  onFlip,
  onPrev,
  onNext,
  canNavigate,
  showKeycaps,
}: {
  flipped: boolean;
  onFlip: () => void;
  onPrev: () => void;
  onNext: () => void;
  canNavigate: boolean;
  showKeycaps: boolean;
}) {
  return (
    <div className="sc-course-flashcard-reader-controls__nav">
      <IconCircleButton
        label="Previous card"
        shortcut="ArrowLeft"
        onClick={onPrev}
        disabled={!canNavigate}
      >
        <ArrowLeft size={18} weight="bold" aria-hidden />
      </IconCircleButton>
      <Button
        type="button"
        variant="surface"
        radius="full"
        onClick={onFlip}
        aria-keyshortcuts="Space"
        className="sc-course-flashcard-reader-controls__flip-button"
      >
        <FlipIcon size={16} weight="bold" aria-hidden />
        <span>{flipped ? "Show front" : "Flip card"}</span>
        {showKeycaps ? <KeyCap>Space</KeyCap> : null}
      </Button>
      <IconCircleButton
        label="Next card"
        shortcut="ArrowRight"
        onClick={onNext}
        disabled={!canNavigate}
      >
        <ArrowRight size={18} weight="bold" aria-hidden />
      </IconCircleButton>
    </div>
  );
}

function IconCircleButton({
  label,
  shortcut,
  onClick,
  disabled,
  children,
}: {
  label: string;
  shortcut: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <IconButton
      type="button"
      variant="surface"
      radius="full"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      className="sc-course-flashcard-reader-controls__icon-button"
    >
      {children}
    </IconButton>
  );
}

function RatingButton({
  status,
  active,
  onClick,
}: {
  status: FlashcardMasteryStatus;
  active: boolean;
  onClick: () => void;
}) {
  const isGotIt = status === "gotIt";
  return (
    <Button
      type="button"
      variant="surface"
      radius="full"
      onClick={onClick}
      aria-pressed={active}
      aria-keyshortcuts={isGotIt ? "G" : "N"}
      aria-label={isGotIt ? "Mark as got it (G)" : "Mark as not yet (N)"}
      data-course-state={active ? (isGotIt ? "completed" : "available") : undefined}
      className={cn(
        "sc-course-flashcard-rating-button",
        isGotIt
          ? "sc-course-flashcard-rating-button--got-it"
          : "sc-course-flashcard-rating-button--not-yet",
      )}
    >
      {isGotIt ? (
        <Check size={14} weight="bold" aria-hidden />
      ) : (
        <Cross size={14} weight="bold" aria-hidden />
      )}
      <span>{isGotIt ? "Got it" : "Not yet"}</span>
      <KeyCap inverted={active}>{isGotIt ? "G" : "N"}</KeyCap>
    </Button>
  );
}

function KeyCap({ children, inverted }: { children: ReactNode; inverted?: boolean }) {
  return (
    <kbd
      className={cn(
        "sc-course-flashcard-keycap",
        inverted
          ? "sc-course-flashcard-keycap--inverted"
          : "sc-course-flashcard-keycap--default",
      )}
    >
      {children}
    </kbd>
  );
}

export function MasteredState({ onReset, children }: { onReset: () => void; children: ReactNode }) {
  return (
    <div
      className="sc-course-flashcard-mastered"
      data-course-state="completed"
      data-flashcard-focus-target=""
      tabIndex={-1}
    >
      <Trophy
        size={36}
        weight="duotone"
        className="sc-course-flashcard-mastered__icon sc-course-state__indicator"
        aria-hidden
      />
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sc-course-flashcard-mastered__title"
      >
        Deck complete.
      </p>
      <p className="sc-course-flashcard-mastered__body">Reset to study from the top.</p>
      <Button
        type="button"
        variant="surface"
        radius="full"
        onClick={onReset}
        className="sc-course-flashcard-mastered__reset"
      >
        <ResetIcon size={14} weight="bold" aria-hidden />
        Reset deck
      </Button>
      {children}
    </div>
  );
}

export function FlashcardDeckReader({
  controller,
  renderContent,
}: {
  controller: FlashcardDeckController;
  renderContent: () => ReactNode;
}) {
  const deckRef = useRef<HTMLElement | null>(null);
  const wasAllMastered = useRef(controller.allMastered);

  useEffect(() => {
    const completedNow = !wasAllMastered.current && controller.allMastered;
    wasAllMastered.current = controller.allMastered;
    if (!completedNow) return undefined;

    const focusFrame = requestAnimationFrame(() => {
      deckRef.current
        ?.querySelector<HTMLElement>("[data-flashcard-focus-target]")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(focusFrame);
  }, [controller.allMastered]);

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (shouldIgnoreFlashcardPointerFlip(event.target)) return;
    event.currentTarget.focus({ preventScroll: true });
  };

  return (
    <section
      ref={deckRef}
      aria-label="Flashcard deck"
      aria-keyshortcuts="ArrowLeft ArrowRight Space G N"
      tabIndex={0}
      onKeyDown={controller.handleKeyDown}
      onPointerDownCapture={handlePointerDown}
      className="sc-course-flashcard-deck"
      data-flashcard-mode="learner"
    >
      {controller.allMastered ? (
        <MasteredState onReset={controller.resetDeck}>
          <div className="sc-course-flashcard-hidden-content">{renderContent()}</div>
        </MasteredState>
      ) : (
        <>
          <LearnerDeckHeader
            mastered={controller.masteredCount}
            total={controller.totalCards}
            currentIndex={controller.currentIndex}
          />
          <CardStack>{renderContent()}</CardStack>
          <ReaderControls
            flipped={controller.currentFlipped}
            mastery={controller.currentMastery}
            onFlip={controller.flipCurrent}
            onPrev={controller.goPrev}
            onNext={controller.goNext}
            onRate={controller.rateCurrent}
            onReset={controller.resetDeck}
            canNavigate={controller.totalCards > 1}
            masteredCount={controller.masteredCount}
          />
        </>
      )}
    </section>
  );
}

export function FlashcardDeckAuthoring({
  controller,
  addCard,
  renderContent,
}: {
  controller: FlashcardDeckController;
  addCard?: ReactNode;
  renderContent: () => ReactNode;
}) {
  return (
    <section
      aria-label="Flashcard authoring"
      className="sc-course-flashcard-deck"
      data-flashcard-mode="authoring"
    >
      <AuthoringDeckHeader
        total={controller.totalCards}
        currentIndex={controller.currentIndex}
      />
      {addCard}
      <CardStack>{renderContent()}</CardStack>
      <div className="sc-course-flashcard-reader-controls" data-flashcard-authoring-controls="">
        <NavigationControls
          flipped={controller.currentFlipped}
          onFlip={controller.flipCurrent}
          onPrev={controller.goPrev}
          onNext={controller.goNext}
          canNavigate={controller.totalCards > 1}
          showKeycaps={false}
        />
      </div>
    </section>
  );
}

export function FlashcardCardSurface({
  flipped,
  mastery,
  editable,
  onFlip,
  children,
}: {
  flipped: boolean;
  mastery: FlashcardMasteryStatus | undefined;
  editable: boolean;
  onFlip: () => void;
  children: ReactNode;
}) {
  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (shouldIgnoreFlashcardPointerFlip(event.target)) return;
    onFlip();
  };

  const handleCardKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    if (shouldIgnoreFlashcardEnterFlip(event.target)) return;

    event.preventDefault();
    onFlip();
  };

  return (
    <div
      role="group"
      aria-label={editable ? "Flashcard" : flipped ? "Card, back showing" : "Card, front showing"}
      onClick={handleCardClick}
      onKeyDown={handleCardKey}
      tabIndex={-1}
      className="sc-course-flashcard-card__surface"
    >
      <div className="sc-course-flashcard-card__rotator">{children}</div>
      {mastery ? (
        <Badge
          radius="full"
          data-scaffold-card-no-flip
          contentEditable={false}
          data-course-state={mastery === "gotIt" ? "completed" : "available"}
          className="sc-course-flashcard-card__mastery-badge"
        >
          {mastery === "gotIt" ? (
            <>
              <Check size={12} weight="bold" aria-hidden />
              Mastered
            </>
          ) : (
            "Review again"
          )}
        </Badge>
      ) : null}
    </div>
  );
}
