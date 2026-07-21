import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import {
  ArrowLeftIcon as ArrowLeft,
  ArrowRightIcon as ArrowRight,
  ArrowsClockwiseIcon as FlipIcon,
  ArrowsCounterClockwiseIcon as ResetIcon,
  CheckIcon as Check,
  TrophyIcon as Trophy,
  XIcon as Cross,
} from "@phosphor-icons/react";

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
}: {
  editable: boolean;
  cardId: string;
  controller: FlashcardCardController;
}) {
  if (!controller.isCurrent) {
    return (
      <NodeViewWrapper
        data-node="flashcard-card"
        data-id={cardId}
        className="sc-flashcard-card--inactive"
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
      className="sc-flashcard-card"
    >
      <FlashcardCardSurface
        flipped={controller.flipped}
        mastery={controller.mastery}
        editable={editable}
        showFlipHint={editable}
        onFlip={controller.flip}
      >
        <NodeViewContent className="sc-flashcard-content" />
      </FlashcardCardSurface>
    </NodeViewWrapper>
  );
}

export function CardStack({ children }: { children: ReactNode }) {
  return <div className="sc-flashcard-stack">{children}</div>;
}

export function DeckHeader({
  mastered,
  total,
  currentIndex,
}: {
  mastered: number;
  total: number;
  currentIndex: number;
}) {
  if (total === 0) return null;
  const percent = Math.round((mastered / total) * 100);
  return (
    <div className="sc-flashcard-deck-header">
      <div className="sc-flashcard-deck-header__row">
        <span className="sc-flashcard-deck-header__status">
          {mastered === 0
            ? "Flip to study, rate as you go"
            : mastered === total
              ? "Deck complete"
              : `${mastered} of ${total} mastered`}
        </span>
        <span className="sc-flashcard-deck-header__counter">
          {String(currentIndex + 1).padStart(String(total).length, "0")} / {total}
        </span>
      </div>
      <div className="sc-flashcard-deck-header__progress">
        <div
          className="sc-flashcard-deck-header__progress-value"
          style={{ width: `${percent}%` }}
          aria-hidden
        />
      </div>
    </div>
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
    <div className="sc-flashcard-reader-controls">
      <div className="sc-flashcard-reader-controls__nav">
        <IconCircleButton label="Previous card" onClick={onPrev} disabled={!canNavigate}>
          <ArrowLeft size={16} weight="bold" aria-hidden />
        </IconCircleButton>
        <button
          type="button"
          onClick={onFlip}
          className="sc-flashcard-reader-controls__flip-button"
        >
          <FlipIcon size={14} weight="bold" aria-hidden />
          <span>{flipped ? "Show front" : "Flip card"}</span>
          <KeyCap>Space</KeyCap>
        </button>
        <IconCircleButton label="Next card" onClick={onNext} disabled={!canNavigate}>
          <ArrowRight size={16} weight="bold" aria-hidden />
        </IconCircleButton>
      </div>
      <div className="sc-flashcard-reader-controls__ratings">
        <RatingButton
          status="notYet"
          active={mastery === "notYet"}
          onClick={() => onRate("notYet")}
        />
        <RatingButton status="gotIt" active={mastery === "gotIt"} onClick={() => onRate("gotIt")} />
      </div>
      {masteredCount > 0 ? (
        <div className="sc-flashcard-reader-controls__reset-row">
          <button
            type="button"
            onClick={onReset}
            className="sc-flashcard-reader-controls__reset-button"
          >
            <ResetIcon size={11} weight="bold" aria-hidden />
            Reset deck
          </button>
        </div>
      ) : null}
    </div>
  );
}

function IconCircleButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="sc-flashcard-reader-controls__icon-button"
    >
      {children}
    </button>
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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={isGotIt ? "Mark as got it (G)" : "Mark as not yet (N)"}
      className={cn(
        "sc-flashcard-rating-button",
        isGotIt && active && "sc-flashcard-rating-button--got-it-active",
        isGotIt && !active && "sc-flashcard-rating-button--got-it-idle",
        !isGotIt && active && "sc-flashcard-rating-button--not-yet-active",
        !isGotIt && !active && "sc-flashcard-rating-button--not-yet-idle",
      )}
    >
      {isGotIt ? (
        <Check size={12} weight="bold" aria-hidden />
      ) : (
        <Cross size={12} weight="bold" aria-hidden />
      )}
      <span>{isGotIt ? "Got it" : "Not yet"}</span>
      <KeyCap inverted={active}>{isGotIt ? "G" : "N"}</KeyCap>
    </button>
  );
}

function KeyCap({ children, inverted }: { children: ReactNode; inverted?: boolean }) {
  return (
    <kbd
      className={cn(
        "sc-flashcard-keycap",
        inverted ? "sc-flashcard-keycap--inverted" : "sc-flashcard-keycap--default",
      )}
    >
      {children}
    </kbd>
  );
}

export function MasteredState({ onReset, children }: { onReset: () => void; children: ReactNode }) {
  return (
    <div className="sc-flashcard-mastered">
      <Trophy size={36} weight="duotone" className="sc-flashcard-mastered__icon" aria-hidden />
      <p className="sc-flashcard-mastered__title">Deck complete.</p>
      <p className="sc-flashcard-mastered__body">Reset to study from the top.</p>
      <button type="button" onClick={onReset} className="sc-flashcard-mastered__reset">
        <ResetIcon size={12} weight="bold" aria-hidden />
        Reset deck
      </button>
      {children}
    </div>
  );
}

export function FlashcardDeckReader({
  controller,
  addCard,
  renderContent,
}: {
  controller: FlashcardDeckController;
  addCard?: ReactNode;
  renderContent: () => ReactNode;
}) {
  if (controller.allMastered) {
    return (
      <MasteredState onReset={controller.resetDeck}>
        <div className="sc-flashcard-hidden-content">{renderContent()}</div>
      </MasteredState>
    );
  }

  return (
    <div className="sc-flashcard-deck">
      <DeckHeader
        mastered={controller.masteredCount}
        total={controller.totalCards}
        currentIndex={controller.currentIndex}
      />
      {addCard}
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
    </div>
  );
}

export function FlashcardCardSurface({
  flipped,
  mastery,
  editable,
  showFlipHint,
  onFlip,
  children,
}: {
  flipped: boolean;
  mastery: FlashcardMasteryStatus | undefined;
  editable: boolean;
  showFlipHint?: boolean;
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
      aria-label={flipped ? "Card, back showing" : "Card, front showing"}
      onClick={handleCardClick}
      onKeyDown={handleCardKey}
      tabIndex={editable ? -1 : 0}
      className="sc-flashcard-card__surface"
    >
      <div aria-hidden className="sc-flashcard-card__rotator">
        {children}
      </div>
      {mastery ? (
        <span
          data-scaffold-card-no-flip
          contentEditable={false}
          className={cn(
            "sc-flashcard-card__mastery-badge",
            mastery === "gotIt" && "sc-flashcard-card__mastery-badge--got-it",
            mastery === "notYet" && "sc-flashcard-card__mastery-badge--not-yet",
          )}
        >
          {mastery === "gotIt" ? (
            <>
              <Check size={10} weight="bold" aria-hidden />
              Mastered
            </>
          ) : (
            "Review again"
          )}
        </span>
      ) : null}
      {showFlipHint ? (
        <span
          data-scaffold-card-no-flip
          contentEditable={false}
          aria-hidden
          className="sc-flashcard-card__flip-hint"
        >
          Click anywhere on the card to flip
        </span>
      ) : null}
    </div>
  );
}
