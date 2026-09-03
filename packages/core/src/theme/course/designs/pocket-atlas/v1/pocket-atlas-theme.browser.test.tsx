import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/ui/components/app/Combobox/Combobox.css";
import "@/editor/blocks/code/code-block/CodeBlock.css";
import "@/editor/blocks/code/code-block/CodeBlockAuthoringControls.css";
import "@/editor/blocks/presentation/flashcard/flashcard.css";
import "@/editor/blocks/presentation/timeline/timeline.css";
import "@/editor/blocks/structured-content/comparison/Comparison.css";
import "@/editor/blocks/structured-content/comparison/ComparisonAuthoringControls.css";
import "@/editor/blocks/structured-content/glossary/GlossaryAuthoringControls.css";
import "@/editor/blocks/assessment/shared/chrome/assessment-control-layout.css";
import "@/editor/blocks/assessment/shared/nodes/assessment-shared-chrome.css";
import "@/editor/blocks/assessment/quiz/Quiz.css";
import "@/editor/blocks/media/ImageBlock.css";
import "@/editor/arrangements/layout/shared/view/layout.css";
import "@/editor/arrangements/layout/tabs/tabs.css";
import "@/editor/movement/view/movement-handles.css";
import "@/editor/suggestions/insert/ghost-add.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { readChartTokens } from "@/editor/blocks/media/chart/chart-theme";
import { AttemptCounter } from "@/editor/blocks/assessment/shared/chrome/AttemptCounter";
import { AssessmentSubmissionControl } from "@/ui/components/course/AssessmentSubmissionControl/AssessmentSubmissionControl";
import { AssessmentSupportButton } from "@/ui/components/course/AssessmentSupportButton/AssessmentSupportButton";
import { CourseButton } from "@/ui/components/course/CourseActions/CourseActions";
import { Button } from "@/ui/components/Button/Button";
import "@/editor/blocks/assessment/shared/chrome/assessment-hints.css";

import "./theme.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Pocket Atlas Course theme", () => {
  it.each(["light", "dark"] as const)(
    "commits the pixel design in %s mode without reskinning App-owned controls",
    async (appearance) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      mountedRoots.push(root);

      root.render(
        <AppThemeProvider appearance={appearance}>
          <CourseThemeProvider
            appearance={appearance}
            theme={{
              schemaVersion: 1,
              design: { id: "pocket-atlas", revision: "1" },
              colourSystem: { id: "pocket-atlas", revision: "1" },
              overrides: {},
            }}
          >
            <main className="sc-page-default-surface-view" data-testid="page">
              <h2 data-testid="heading">Field notes</h2>
              <section className="sc-course-glossary__section">
                <div className="sc-course-glossary__entry" data-testid="entry">
                  <strong className="sc-course-glossary__term">Habitat</strong>
                  <span className="sc-course-glossary__definition">Where a species lives.</span>
                </div>
                <button className="sc-app-glossary-add" data-testid="app-control" type="button">
                  Add term
                </button>
                <Button
                  className="sc-app-assessment-hints-trigger"
                  data-testid="app-hint-trigger"
                  size="lg"
                  variant="ghost"
                >
                  Add hint
                </Button>
              </section>
              <div className="sc-course-tabs">
                <div className="sc-course-tabs__list" data-variant="pills">
                  <button
                    className="sc-course-tabs__trigger"
                    data-state="active"
                    data-testid="active-tab"
                    type="button"
                  >
                    Specimen
                  </button>
                </div>
              </div>
            </main>
          </CourseThemeProvider>
        </AppThemeProvider>,
      );

      await waitForCondition(() => host.querySelector('[data-testid="heading"]') !== null);

      const courseRoot = requiredElement<HTMLElement>(host, ".sc-course");
      const heading = requiredElement<HTMLElement>(host, '[data-testid="heading"]');
      const page = requiredElement<HTMLElement>(host, '[data-testid="page"]');
      const entry = requiredElement<HTMLElement>(host, '[data-testid="entry"]');
      const activeTab = requiredElement<HTMLElement>(host, '[data-testid="active-tab"]');
      const appControl = requiredElement<HTMLElement>(host, '[data-testid="app-control"]');
      const appHintTrigger = requiredElement<HTMLElement>(host, '[data-testid="app-hint-trigger"]');

      expect(courseRoot).toHaveClass("sc-course-theme-pocket-atlas-v1");
      expect(getComputedStyle(courseRoot).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(getComputedStyle(courseRoot).backgroundImage).toBe("none");
      expect(getComputedStyle(heading).fontFamily).toContain("Silkscreen");
      expect(getComputedStyle(heading).marginTop).toBe("0px");
      expect(getComputedStyle(page).borderTopWidth).toBe("2px");
      expect(getComputedStyle(page).borderRadius).toBe("0px");
      expect(Number.parseFloat(getComputedStyle(page).paddingTop)).toBeLessThanOrEqual(32);
      expect(getComputedStyle(page).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(getComputedStyle(entry).boxShadow).not.toBe("none");
      expect(getComputedStyle(activeTab).transform).not.toBe("none");
      expect(getComputedStyle(appControl).fontFamily).toContain("Satoshi");
      expect(getComputedStyle(appHintTrigger).fontFamily).toContain("Satoshi");
    },
  );

  it("keeps tab variants distinct and authoring chrome clear of the tab label", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <AppThemeProvider appearance="light">
        <CourseThemeProvider
          appearance="light"
          theme={{
            schemaVersion: 1,
            design: { id: "pocket-atlas", revision: "1" },
            colourSystem: { id: "pocket-atlas", revision: "1" },
            overrides: {},
          }}
        >
          <div className="sc-course-tabs">
            <div className="sc-course-tabs__list" data-testid="pills-list" data-variant="pills">
              <div className="sc-course-tabs__item" data-course-tabs-item="">
                <button
                  aria-label="Move section"
                  className="sc-app-structure-movement-handle sc-app-structure-movement-handle--bare sc-app-compact-movement-handle sc-app-tabs-handle"
                  data-testid="tab-handle"
                  type="button"
                >
                  <span
                    className="sc-app-structure-movement-handle__visual sc-app-compact-movement-handle__visual"
                    data-testid="tab-handle-visual"
                  />
                </button>
                <button
                  className="sc-course-tabs__trigger"
                  data-state="active"
                  data-testid="pills-tab"
                  type="button"
                >
                  <span className="sc-course-tabs__trigger-label" data-testid="tab-label">
                    Specimen
                  </span>
                </button>
                <button
                  aria-label="Section options"
                  className="sc-layout-section-action-trigger sc-app-tabs-action"
                  type="button"
                />
              </div>
              <button
                className="sc-app-block-add sc-layout-add-ghost sc-layout-add-ghost--inline sc-app-tabs-add"
                data-testid="add-tab"
                type="button"
              >
                <span className="sc-app-block-add__icon" />
                <span>Add tab</span>
              </button>
            </div>
            <div
              className="sc-course-tabs__list"
              data-testid="underline-list"
              data-variant="underline"
            >
              <div className="sc-course-tabs__item">
                <button
                  className="sc-course-tabs__trigger"
                  data-state="active"
                  data-testid="underline-tab"
                  type="button"
                >
                  <span className="sc-course-tabs__trigger-label">Details</span>
                </button>
              </div>
              <div className="sc-course-tabs__item">
                <button
                  className="sc-course-tabs__trigger"
                  data-state="inactive"
                  data-testid="underline-tab-inactive"
                  type="button"
                >
                  <span className="sc-course-tabs__trigger-label">Examples</span>
                </button>
              </div>
            </div>
            <div className="sc-course-tabs__list" data-testid="default-list" data-variant="default">
              <div className="sc-course-tabs__item">
                <button
                  className="sc-course-tabs__trigger"
                  data-state="active"
                  data-testid="default-tab"
                  type="button"
                >
                  <span className="sc-course-tabs__trigger-label">Overview</span>
                </button>
              </div>
            </div>
          </div>
        </CourseThemeProvider>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector('[data-testid="pills-tab"]') !== null);

    const pillsList = requiredElement<HTMLElement>(host, '[data-testid="pills-list"]');
    const underlineList = requiredElement<HTMLElement>(host, '[data-testid="underline-list"]');
    const defaultList = requiredElement<HTMLElement>(host, '[data-testid="default-list"]');
    const pillsTab = requiredElement<HTMLElement>(host, '[data-testid="pills-tab"]');
    const underlineTab = requiredElement<HTMLElement>(host, '[data-testid="underline-tab"]');
    const inactiveUnderlineTab = requiredElement<HTMLElement>(
      host,
      '[data-testid="underline-tab-inactive"]',
    );
    const defaultTab = requiredElement<HTMLElement>(host, '[data-testid="default-tab"]');
    const handle = requiredElement<HTMLElement>(host, '[data-testid="tab-handle"]');
    const handleVisual = requiredElement<HTMLElement>(host, '[data-testid="tab-handle-visual"]');
    const label = requiredElement<HTMLElement>(host, '[data-testid="tab-label"]');
    const addTab = requiredElement<HTMLElement>(host, '[data-testid="add-tab"]');
    const triggerRect = pillsTab.getBoundingClientRect();
    const handleRect = handle.getBoundingClientRect();

    expect(getComputedStyle(pillsList).borderBottomWidth).toBe("0px");
    expect(getComputedStyle(pillsTab).borderRadius).not.toBe("0px");
    expect(getComputedStyle(underlineTab).boxShadow).toBe("none");
    expect(getComputedStyle(underlineTab).transform).toBe("none");
    expect(getComputedStyle(defaultTab).boxShadow).not.toBe("none");
    expect(label.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      handleVisual.getBoundingClientRect().right + 4,
    );
    expect(triggerRect.left + triggerRect.width / 2).toBeGreaterThan(handleRect.right);
    expect(addTab.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    for (const list of [defaultList, pillsList, underlineList]) {
      const style = getComputedStyle(list);
      expect(Number.parseFloat(style.paddingTop)).toBeGreaterThanOrEqual(8);
      expect(Number.parseFloat(style.paddingLeft)).toBeGreaterThanOrEqual(8);
      expect(Number.parseFloat(style.paddingRight)).toBeGreaterThanOrEqual(8);
    }

    const restingUnderlineBackground = getComputedStyle(inactiveUnderlineTab).backgroundColor;
    await userEvent.hover(inactiveUnderlineTab);
    await waitForCondition(
      () => getComputedStyle(inactiveUnderlineTab).backgroundColor !== restingUnderlineBackground,
    );
    expect(getComputedStyle(inactiveUnderlineTab).backgroundColor).not.toBe(
      restingUnderlineBackground,
    );
    expect(getComputedStyle(inactiveUnderlineTab).transform).toBe("none");
  });

  it.each(["light", "dark"] as const)(
    "keeps the code block legible and correctly owned in %s mode",
    async (appearance) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      mountedRoots.push(root);

      root.render(
        <AppThemeProvider appearance={appearance}>
          <div>
            <CourseThemeProvider
              appearance={appearance}
              theme={{
                schemaVersion: 1,
                design: { id: "pocket-atlas", revision: "1" },
                colourSystem: { id: "pocket-atlas", revision: "1" },
                overrides: {},
              }}
            >
              <div className="sc-course-code-block">
                <div className="sc-course-code-block__shell">
                  <header className="sc-course-code-block__header" data-testid="code-header">
                    <button
                      className="sc-app-combobox-trigger sc-app-code-block__language-trigger"
                      data-testid="language-trigger"
                      type="button"
                    >
                      Plain text
                    </button>
                    <button
                      className="sc-course-action sc-course-code-block__copy"
                      data-copy-state="idle"
                      data-testid="copy-button"
                      type="button"
                    >
                      Copy
                    </button>
                  </header>
                  <div className="sc-course-code-block__body" data-testid="code-body">
                    <pre className="sc-course-code-block__pre" data-testid="code-pre">
                      <code className="sc-course-code-block__content">
                        <span className="hljs-keyword" data-testid="syntax-keyword">
                          const
                        </span>{" "}
                        habitat = &quot;woodland&quot;
                      </code>
                    </pre>
                  </div>
                </div>
              </div>
            </CourseThemeProvider>
          </div>
        </AppThemeProvider>,
      );

      await waitForCondition(() => host.querySelector('[data-testid="code-header"]') !== null);

      const header = requiredElement<HTMLElement>(host, '[data-testid="code-header"]');
      const languageTrigger = requiredElement<HTMLElement>(
        host,
        '[data-testid="language-trigger"]',
      );
      const copyButton = requiredElement<HTMLElement>(host, '[data-testid="copy-button"]');
      const body = requiredElement<HTMLElement>(host, '[data-testid="code-body"]');
      const pre = requiredElement<HTMLElement>(host, '[data-testid="code-pre"]');
      const keyword = requiredElement<HTMLElement>(host, '[data-testid="syntax-keyword"]');

      const headerStyle = getComputedStyle(header);
      const languageStyle = getComputedStyle(languageTrigger);
      const copyStyle = getComputedStyle(copyButton);
      const bodyStyle = getComputedStyle(body);
      const preStyle = getComputedStyle(pre);
      const keywordStyle = getComputedStyle(keyword);

      expect(headerStyle.color).toBe(
        appearance === "light" ? "rgb(255, 255, 255)" : "rgb(32, 22, 79)",
      );
      expect(languageStyle.fontFamily).toContain("Satoshi");
      expect(languageStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(
        contrastRatio(languageStyle.color, languageStyle.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
      expect(copyStyle.fontFamily).toContain("Silkscreen");
      expect(copyStyle.color).toBe(headerStyle.color);
      expect(Number.parseFloat(copyStyle.minHeight)).toBeGreaterThanOrEqual(44);
      expect(contrastRatio(copyStyle.color, headerStyle.backgroundColor)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(bodyStyle.backgroundColor).toBe("rgb(23, 17, 41)");
      expect(preStyle.backgroundColor).toBe("rgb(23, 17, 41)");
      expect(keywordStyle.color).not.toBe(preStyle.color);
      expect(contrastRatio(keywordStyle.color, preStyle.backgroundColor)).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );

  it.each(["light", "dark"] as const)(
    "keeps shared assessment chrome legible, separated, and stateful in %s mode",
    async (appearance) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      mountedRoots.push(root);

      root.render(
        <AppThemeProvider appearance={appearance}>
          <CourseThemeProvider
            appearance={appearance}
            theme={{
              schemaVersion: 1,
              design: { id: "pocket-atlas", revision: "1" },
              colourSystem: { id: "pocket-atlas", revision: "1" },
              overrides: {},
            }}
          >
            <section
              className="sc-course-assessment-shell"
              data-testid="assessment-shell"
              style={{ width: 280 }}
            >
              <div className="sc-course-assessment-meta-title" data-slot="assessment-title">
                Checkpoint
              </div>
              <div
                className="sc-course-assessment-meta-instructions"
                data-slot="assessment-instructions"
                data-testid="assessment-meta"
              >
                <span className="sc-course-assessment-meta-default">·</span>
                <span>Choose one</span>
                <span className="sc-course-assessment-meta-default">·</span>
                <span className="sc-course-assessment-meta-default">1 point</span>
              </div>
              <div className="sc-assessment-control-layout">
                <div
                  className="sc-assessment-control-layout__support"
                  data-testid="assessment-support"
                >
                  <AssessmentSupportButton intent="hint">Add hint</AssessmentSupportButton>
                  <AssessmentSupportButton intent="feedback">Show feedback</AssessmentSupportButton>
                  <AssessmentSupportButton intent="answer" aria-pressed="true">
                    Show answer
                  </AssessmentSupportButton>
                </div>
                <div className="sc-assessment-control-layout__submission">
                  <AssessmentSubmissionControl state="correct" />
                  <AttemptCounter attempts={1} maxAttempts={3} />
                </div>
              </div>
            </section>
          </CourseThemeProvider>
        </AppThemeProvider>,
      );

      await waitForCondition(() => host.querySelector('[data-testid="assessment-shell"]') !== null);

      const meta = requiredElement<HTMLElement>(host, '[data-testid="assessment-meta"]');
      const supportZone = requiredElement<HTMLElement>(host, '[data-testid="assessment-support"]');
      const supportButtons = Array.from(
        supportZone.querySelectorAll<HTMLElement>(".sc-course-assessment-support-button"),
      );
      const submissionStatus = requiredElement<HTMLElement>(
        host,
        ".sc-course-assessment-submission-control__status",
      );
      const attemptCounter = requiredElement<HTMLElement>(
        host,
        ".sc-course-assessment-attempt-counter",
      );

      expect(Number.parseFloat(getComputedStyle(meta).columnGap)).toBeGreaterThan(0);
      expect(Number.parseFloat(getComputedStyle(supportZone).columnGap)).toBeGreaterThan(0);
      expect(supportZone.scrollWidth).toBeLessThanOrEqual(supportZone.clientWidth);
      expect(supportButtons).toHaveLength(3);
      for (const button of supportButtons) {
        const style = getComputedStyle(button);
        expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
        expect(style.boxSizing).toBe("border-box");
        expect(style.marginLeft).toBe("0px");
        expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      }
      for (let index = 1; index < supportButtons.length; index += 1) {
        const previous = supportButtons[index - 1]!.getBoundingClientRect();
        const current = supportButtons[index]!.getBoundingClientRect();
        expect(current.left >= previous.right || current.top >= previous.bottom).toBe(true);
      }
      const answerToggle = supportButtons[2]!;
      expect(answerToggle.getAttribute("aria-pressed")).toBe("true");
      expect(getComputedStyle(answerToggle).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      const submissionStyle = getComputedStyle(submissionStatus);
      expect(submissionStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(submissionStyle.borderStyle).toBe("solid");
      expect(getComputedStyle(attemptCounter).fontFamily).toContain("Silkscreen");
    },
  );

  it.each(["light", "dark"] as const)(
    "gives the comparison body accessible rhythm and a complete compact recipe in %s mode",
    async (appearance) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      mountedRoots.push(root);

      root.render(
        <AppThemeProvider appearance={appearance}>
          <CourseThemeProvider
            appearance={appearance}
            theme={{
              schemaVersion: 1,
              design: { id: "pocket-atlas", revision: "1" },
              colourSystem: { id: "pocket-atlas", revision: "1" },
              overrides: {},
            }}
          >
            <main>
              <ComparisonSpecimen id="wide" width={700} />
              <ComparisonSpecimen id="compact" width={300} />
            </main>
          </CourseThemeProvider>
        </AppThemeProvider>,
      );

      await waitForCondition(() => host.querySelector('[data-comparison="compact"]') !== null);

      const wide = requiredElement<HTMLElement>(host, '[data-comparison="wide"]');
      const compact = requiredElement<HTMLElement>(host, '[data-comparison="compact"]');
      const wideHeader = requiredElement<HTMLElement>(wide, ".sc-course-comparison__header-cell");
      const wideContent = requiredElement<HTMLElement>(wide, ".sc-course-comparison__cell-content");
      const filledContent = requiredElement<HTMLElement>(wide, '[data-testid="filled-content"]');
      const placeholder = requiredElement<HTMLElement>(wide, '[data-testid="placeholder"]');
      const compactRightCell = requiredElement<HTMLElement>(
        compact,
        ".sc-course-comparison__cell--right",
      );
      const compactLabel = requiredElement<HTMLElement>(
        compact,
        ".sc-course-comparison__cell-label",
      );

      const headerStyle = getComputedStyle(wideHeader);
      const contentStyle = getComputedStyle(wideContent);
      const placeholderStyle = getComputedStyle(placeholder, "::before");
      const surfaceStyle = getComputedStyle(
        requiredElement<HTMLElement>(wide, ".sc-course-comparison__surface"),
      );
      const compactRightStyle = getComputedStyle(compactRightCell);
      const compactLabelStyle = getComputedStyle(compactLabel);

      expect(contrastRatio(headerStyle.color, headerStyle.backgroundColor)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contentStyle.paddingTop).toBe("12px");
      expect(contentStyle.paddingRight).toBe("16px");
      expect(filledContent.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
      expect(
        contrastRatioWithOpacity(
          placeholderStyle.color,
          surfaceStyle.backgroundColor,
          Number.parseFloat(placeholderStyle.opacity),
        ),
      ).toBeGreaterThanOrEqual(4.5);
      expect(compactRightStyle.borderInlineStartWidth).toBe("0px");
      expect(compactRightStyle.borderTopStyle).toBe("dashed");
      expect(compactLabelStyle.display).toBe("block");
      expect(compactLabelStyle.fontFamily).toContain("Silkscreen");
      expect(
        contrastRatio(compactLabelStyle.color, surfaceStyle.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(["light", "dark"] as const)(
    "keeps Flashcards focused, usable and legible in %s mode",
    async (appearance) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      mountedRoots.push(root);

      root.render(
        <AppThemeProvider appearance={appearance}>
          <CourseThemeProvider
            appearance={appearance}
            theme={{
              schemaVersion: 1,
              design: { id: "pocket-atlas", revision: "1" },
              colourSystem: { id: "pocket-atlas", revision: "1" },
              overrides: {},
            }}
          >
            <FlashcardSpecimen />
          </CourseThemeProvider>
        </AppThemeProvider>,
      );

      await waitForCondition(() => host.querySelector("[data-flashcard-specimen]") !== null);

      const deck = requiredElement<HTMLElement>(host, ".sc-course-flashcard-deck");
      const header = requiredElement<HTMLElement>(host, ".sc-course-flashcard-deck-header");
      const headerRow = requiredElement<HTMLElement>(host, ".sc-course-flashcard-deck-header__row");
      const surface = requiredElement<HTMLElement>(host, ".sc-course-flashcard-card__surface");
      const side = requiredElement<HTMLElement>(host, ".sc-course-flashcard-side--front");
      const inner = requiredElement<HTMLElement>(host, ".sc-course-flashcard-side__inner");
      const content = requiredElement<HTMLElement>(
        host,
        ".sc-course-flashcard-side__content--front",
      );
      const nav = requiredElement<HTMLElement>(host, ".sc-course-flashcard-reader-controls__nav");
      const ratings = requiredElement<HTMLElement>(
        host,
        ".sc-course-flashcard-reader-controls__ratings",
      );
      const iconButton = requiredElement<HTMLElement>(
        host,
        ".sc-course-flashcard-reader-controls__icon-button",
      );
      const flipButton = requiredElement<HTMLElement>(
        host,
        ".sc-course-flashcard-reader-controls__flip-button",
      );
      const mastered = requiredElement<HTMLElement>(host, ".sc-course-flashcard-mastered");
      const masteredReset = requiredElement<HTMLElement>(
        host,
        ".sc-course-flashcard-mastered__reset",
      );

      const headerStyle = getComputedStyle(header);
      const surfaceStyle = getComputedStyle(surface);
      const sideStyle = getComputedStyle(side);
      const contentStyle = getComputedStyle(content);
      const flipStyle = getComputedStyle(flipButton);
      const masteredStyle = getComputedStyle(mastered);

      expect(getComputedStyle(deck).maxWidth).toBe("640px");
      expect(getComputedStyle(headerRow).display).toBe("flex");
      expect(getComputedStyle(headerRow).justifyContent).toBe("space-between");
      expect(contrastRatio(headerStyle.color, headerStyle.backgroundColor)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(surfaceStyle.borderTopWidth).toBe("0px");
      expect(surfaceStyle.boxShadow).toBe("none");
      expect(surfaceStyle.overflow).toBe("visible");
      expect(Number.parseFloat(sideStyle.borderTopWidth)).toBeGreaterThan(0);
      expect(sideStyle.boxShadow).not.toBe("none");
      expect(getComputedStyle(side).justifyContent).toBe("center");
      expect(getComputedStyle(inner).alignItems).toBe("center");
      expect(getComputedStyle(inner).justifyContent).toBe("center");
      expect(contentStyle.textAlign).toBe("center");
      expect(Number.parseFloat(contentStyle.fontSize)).toBeGreaterThanOrEqual(22);
      expect(Number.parseFloat(contentStyle.fontWeight)).toBeGreaterThanOrEqual(600);
      expect(getComputedStyle(nav).display).toBe("flex");
      expect(getComputedStyle(nav).justifyContent).toBe("space-between");
      expect(getComputedStyle(ratings).display).toBe("grid");
      expect(iconButton.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(iconButton.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      expect(contrastRatio(flipStyle.color, flipStyle.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      expect(getComputedStyle(mastered).display).toBe("flex");
      expect(getComputedStyle(mastered).maxWidth).toBe("640px");
      expect(
        contrastRatio(masteredStyle.color, masteredStyle.backgroundColor),
        `${masteredStyle.color} on ${masteredStyle.backgroundColor}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(masteredReset.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    },
  );

  it.each(["light", "dark"] as const)(
    "gives the Quiz header and learner navigation a complete pixel recipe in %s mode",
    async (appearance) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      mountedRoots.push(root);

      root.render(
        <AppThemeProvider appearance={appearance}>
          <CourseThemeProvider
            appearance={appearance}
            theme={{
              schemaVersion: 1,
              design: { id: "pocket-atlas", revision: "1" },
              colourSystem: { id: "pocket-atlas", revision: "1" },
              overrides: {},
            }}
          >
            <QuizNavigationSpecimen />
          </CourseThemeProvider>
        </AppThemeProvider>,
      );

      await waitForCondition(() => host.querySelector("[data-quiz-specimen]") !== null);

      const header = requiredElement<HTMLElement>(host, ".sc-course-quiz__header");
      const brand = requiredElement<HTMLElement>(host, ".sc-course-quiz__brand");
      const mark = requiredElement<HTMLElement>(host, ".sc-course-quiz__brand-mark");
      const label = requiredElement<HTMLElement>(host, ".sc-course-quiz__brand-label");
      const meta = requiredElement<HTMLElement>(host, ".sc-course-quiz__brand-meta");
      const controls = requiredElement<HTMLElement>(host, ".sc-course-quiz__runtime-controls");
      const nav = requiredElement<HTMLElement>(host, ".sc-course-quiz__runtime-nav");
      const previous = requiredElement<HTMLButtonElement>(host, '[aria-label="Previous question"]');
      const next = requiredElement<HTMLButtonElement>(host, '[aria-label="Next question"]');
      const start = requiredElement<HTMLButtonElement>(host, '[data-testid="quiz-primary"]');

      expect(getComputedStyle(header).paddingTop).toBe("12px");
      expect(getComputedStyle(header).paddingLeft).toBe("16px");
      expect(getComputedStyle(brand).columnGap).toBe("8px");
      expect(mark.getBoundingClientRect().width).toBe(20);
      expect(mark.getBoundingClientRect().height).toBe(20);
      expect(getComputedStyle(label).fontFamily).toContain("Silkscreen");
      expect(getComputedStyle(label).fontSize).toBe("12px");
      expect(getComputedStyle(meta).fontFamily).toContain("Atkinson Hyperlegible");
      expect(getComputedStyle(meta).fontSize).toBe("14px");
      expect(getComputedStyle(controls).paddingLeft).toBe("16px");
      expect(getComputedStyle(nav).columnGap).toBe("8px");

      for (const button of [previous, next, start]) {
        const style = getComputedStyle(button);
        expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
        expect(style.borderTopWidth).toBe("2px");
        expect(style.borderRadius).toBe("0px");
        expect(style.fontFamily).toContain("Silkscreen");
        expect(style.fontSize).toBe("12px");
        expect(style.fontWeight).toBe("700");
        expect(style.boxShadow).not.toBe("none");
        expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      }

      await userEvent.hover(next);
      const hoveredNextStyle = getComputedStyle(next);
      expect(
        contrastRatio(hoveredNextStyle.color, hoveredNextStyle.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(["light", "dark"] as const)(
    "styles every learner Quiz runtime state in %s mode",
    async (appearance) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      mountedRoots.push(root);

      root.render(
        <CourseThemeProvider
          appearance={appearance}
          theme={{
            schemaVersion: 1,
            design: { id: "pocket-atlas", revision: "1" },
            colourSystem: { id: "pocket-atlas", revision: "1" },
            overrides: {},
          }}
        >
          <QuizRuntimeStatesSpecimen />
        </CourseThemeProvider>,
      );

      await waitForCondition(() => host.querySelector("[data-quiz-runtime-states]") !== null);

      const card = requiredElement<HTMLElement>(host, ".sc-course-quiz__runtime-card");
      const title = requiredElement<HTMLElement>(host, ".sc-course-quiz__runtime-title");
      const meta = requiredElement<HTMLElement>(host, ".sc-course-quiz__runtime-meta");
      const incomplete = requiredElement<HTMLElement>(host, ".sc-course-quiz__runtime-incomplete");
      const review = requiredElement<HTMLElement>(host, ".sc-course-quiz__review-context");
      const reviewLabel = requiredElement<HTMLElement>(
        host,
        ".sc-course-quiz__review-context-label",
      );
      const timer = requiredElement<HTMLElement>(host, ".sc-course-quiz__timer");
      const request = requiredElement<HTMLElement>(host, ".sc-course-quiz__request-feedback");
      const completion = requiredElement<HTMLElement>(host, ".sc-course-quiz__completion");
      const expired = requiredElement<HTMLElement>(host, ".sc-course-quiz__expired");
      const timesup = requiredElement<HTMLElement>(host, ".sc-course-quiz__timesup");
      const completionMark = requiredElement<HTMLElement>(host, ".sc-course-quiz__completion-mark");
      const completionScore = requiredElement<HTMLElement>(
        host,
        ".sc-course-quiz__completion-score",
      );

      expect(getComputedStyle(card).paddingTop).toBe("20px");
      expect(getComputedStyle(card).rowGap).toBe("12px");
      expect(getComputedStyle(title).marginTop).toBe("0px");
      expect(getComputedStyle(title).fontFamily).toContain("Silkscreen");
      expect(getComputedStyle(meta).fontFamily).toContain("Atkinson Hyperlegible");
      expect(getComputedStyle(incomplete).paddingLeft).toBe("16px");
      expect(getComputedStyle(review).paddingTop).toBe("12px");
      expect(getComputedStyle(reviewLabel).fontFamily).toContain("Silkscreen");
      expect(getComputedStyle(timer).borderTopWidth).toBe("2px");
      expect(getComputedStyle(timer).borderRadius).toBe("0px");
      expect(getComputedStyle(timer).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(getComputedStyle(request).paddingLeft).toBe("16px");

      for (const state of [completion, expired]) {
        expect(getComputedStyle(state).rowGap).toBe("12px");
        expect(getComputedStyle(state).paddingTop).toBe("20px");
        expect(getComputedStyle(state).textAlign).toBe("center");
      }
      expect(getComputedStyle(timesup).rowGap).toBe("12px");
      expect(getComputedStyle(timesup).paddingTop).toBe("24px");
      expect(getComputedStyle(timesup).textAlign).toBe("center");
      expect(completionMark.getBoundingClientRect().width).toBe(44);
      expect(completionMark.getBoundingClientRect().height).toBe(44);
      expect(getComputedStyle(completionMark).boxShadow).not.toBe("none");
      expect(getComputedStyle(completionScore).fontFamily).toContain("Silkscreen");
    },
  );

  it.each(["light", "dark"] as const)(
    "gives the Image block a stable, complete pixel recipe in %s mode",
    async (appearance) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      mountedRoots.push(root);

      root.render(
        <CourseThemeProvider
          appearance={appearance}
          theme={{
            schemaVersion: 1,
            design: { id: "pocket-atlas", revision: "1" },
            colourSystem: { id: "pocket-atlas", revision: "1" },
            overrides: {},
          }}
        >
          <section data-image-specimen="" style={{ width: 640 }}>
            <div className="sc-course-image-block__stage" data-image-state="ready">
              <img
                alt="Pocket field guide"
                className="sc-course-image-block__media"
                src="data:image/gif;base64,R0lGODlhAQABAAAAACw="
              />
            </div>
            <div className="sc-course-image-block__stage" data-image-state="loading">
              <p className="sc-course-image-block__loading" role="status">
                Loading image...
              </p>
            </div>
            <div className="sc-course-image-block__stage" data-image-state="error">
              <p className="sc-course-image-block__error" role="alert">
                Image unavailable
              </p>
            </div>
            <div className="sc-course-image-block__fallback" data-testid="image-fallback" />
          </section>
        </CourseThemeProvider>,
      );

      await waitForCondition(() => host.querySelector("[data-image-specimen]") !== null);

      const media = requiredElement<HTMLElement>(host, ".sc-course-image-block__media");
      const loadingStage = requiredElement<HTMLElement>(
        host,
        '.sc-course-image-block__stage[data-image-state="loading"]',
      );
      const errorStage = requiredElement<HTMLElement>(
        host,
        '.sc-course-image-block__stage[data-image-state="error"]',
      );
      const loading = requiredElement<HTMLElement>(host, ".sc-course-image-block__loading");
      const error = requiredElement<HTMLElement>(host, ".sc-course-image-block__error");
      const fallback = requiredElement<HTMLElement>(host, '[data-testid="image-fallback"]');

      expect(getComputedStyle(loadingStage).minHeight).toBe("192px");
      expect(getComputedStyle(errorStage).minHeight).toBe("192px");

      for (const surface of [media, loading, error, fallback]) {
        const style = getComputedStyle(surface);
        expect(style.borderTopWidth).toBe("2px");
        expect(style.borderRadius).toBe("0px");
        expect(style.boxShadow).not.toBe("none");
        expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      }

      expect(getComputedStyle(fallback).borderTopStyle).toBe("dashed");
      expect(getComputedStyle(loading).display).toBe("grid");
      expect(getComputedStyle(error).display).toBe("grid");
      expect(
        contrastRatio(getComputedStyle(loading).color, getComputedStyle(loading).backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(getComputedStyle(error).color, getComputedStyle(error).backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("covers structured, presentation, media, layout and assessment Course families", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <CourseThemeProvider
        appearance="light"
        theme={{
          schemaVersion: 1,
          design: { id: "pocket-atlas", revision: "1" },
          colourSystem: { id: "pocket-atlas", revision: "1" },
          overrides: {},
        }}
      >
        <main>
          <div className="sc-course-numbered-list__item-shell" data-pixel-surface />
          <div className="sc-course-checklist__item-shell" data-pixel-surface />
          <div className="sc-course-comparison__surface" data-pixel-surface />
          <div className="sc-course-timeline__card" data-pixel-surface />
          <div className="sc-course-roadmap__content" data-pixel-surface />
          <div className="sc-course-process-flow__card" data-pixel-surface />
          <div className="sc-course-flashcard-side" data-pixel-surface />
          <div className="sc-course-gallery__tile" data-pixel-surface />
          <a className="sc-course-resource-link" data-pixel-surface href="#resource">
            Resource
          </a>
          <div className="sc-course-accordion__section" data-pixel-surface />
          <div className="sc-course-paginated__panel" data-pixel-surface />
          <div className="sc-course-assessment-shell" data-pixel-surface />
          <button className="sc-course-assessment-submission-control__button" type="button">
            Submit
          </button>
          <button
            className="sc-course-assessment-submission-control__button"
            data-disabled-submit
            disabled
            type="button"
          >
            Submit
          </button>
        </main>
      </CourseThemeProvider>,
    );

    await waitForCondition(() => host.querySelector("[data-pixel-surface]") !== null);

    for (const surface of host.querySelectorAll<HTMLElement>("[data-pixel-surface]")) {
      const style = getComputedStyle(surface);
      expect(style.borderTopWidth, surface.className).toBe("2px");
      expect(style.borderTopStyle, surface.className).toBe("solid");
      expect(style.borderRadius, surface.className).toBe("0px");
      expect(style.boxShadow, surface.className).not.toBe("none");
    }

    const submit = requiredElement<HTMLElement>(
      host,
      ".sc-course-assessment-submission-control__button",
    );
    expect(getComputedStyle(submit).fontFamily).toContain("Silkscreen");
    expect(getComputedStyle(submit).boxShadow).not.toBe("none");
    const disabledSubmit = requiredElement<HTMLButtonElement>(host, "[data-disabled-submit]");
    expect(getComputedStyle(disabledSubmit).backgroundColor).not.toBe(
      getComputedStyle(submit).backgroundColor,
    );
    expect(getComputedStyle(disabledSubmit).boxShadow).toBe("none");
  });

  it.each(["light", "dark"] as const)(
    "gives the Timeline a complete %s chronology recipe",
    async (appearance) => {
      await page.viewport(1000, 800);
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      mountedRoots.push(root);

      root.render(
        <AppThemeProvider appearance={appearance}>
          <CourseThemeProvider
            appearance={appearance}
            theme={{
              schemaVersion: 1,
              design: { id: "pocket-atlas", revision: "1" },
              colourSystem: { id: "pocket-atlas", revision: "1" },
              overrides: {},
            }}
          >
            <TimelineThemeSpecimen width={700} />
          </CourseThemeProvider>
        </AppThemeProvider>,
      );

      await waitForCondition(() => host.querySelector(".sc-course-timeline__event") !== null);

      const timeline = requiredElement<HTMLElement>(host, ".sc-course-timeline");
      const rail = requiredElement<HTMLElement>(host, ".sc-course-timeline__rail");
      const track = requiredElement<HTMLElement>(host, ".sc-course-timeline__track");
      const event = requiredElement<HTMLElement>(host, ".sc-course-timeline__event");
      const card = requiredElement<HTMLElement>(host, ".sc-course-timeline__card");
      const date = requiredElement<HTMLElement>(host, '[data-timeline-copy="date"]');
      const title = requiredElement<HTMLElement>(host, '[data-timeline-copy="title"]');
      const description = requiredElement<HTMLElement>(host, '[data-timeline-copy="description"]');
      const navigation = requiredElement<HTMLElement>(host, ".sc-course-timeline__navigation");
      const navigationButton = requiredElement<HTMLButtonElement>(
        host,
        ".sc-course-timeline__navigation-button:not(:disabled)",
      );
      const disabledNavigationButton = requiredElement<HTMLButtonElement>(
        host,
        ".sc-course-timeline__navigation-button:disabled",
      );

      expect(
        getComputedStyle(timeline).getPropertyValue("--sc-course-timeline-axis-lane").trim(),
      ).toBe("2rem");
      expect(getComputedStyle(event).gridTemplateColumns.split(" ")).toHaveLength(3);
      expect(getComputedStyle(track).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(getComputedStyle(rail, "::before").content).not.toBe("none");
      expect(getComputedStyle(card).borderTopWidth).toBe("2px");
      expect(getComputedStyle(card).boxShadow).not.toBe("none");
      expect(getComputedStyle(date).fontFamily).toContain("Silkscreen");
      expect(getComputedStyle(title).fontFamily).toContain("Silkscreen");
      expect(Number.parseFloat(getComputedStyle(title).fontSize)).toBeGreaterThan(
        Number.parseFloat(getComputedStyle(date).fontSize),
      );
      expect(
        contrastRatio(getComputedStyle(description).color, getComputedStyle(card).backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
      expect(getComputedStyle(navigation).position).toBe("relative");
      expect(navigationButton.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(navigationButton.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      expect(getComputedStyle(navigationButton).transitionDuration).not.toBe("0s");
      const restingBackground = getComputedStyle(navigationButton).backgroundColor;
      await userEvent.hover(navigationButton);
      await waitForCondition(
        () => getComputedStyle(navigationButton).backgroundColor !== restingBackground,
      );
      expect(getComputedStyle(navigationButton).backgroundColor).not.toBe(restingBackground);
      expect(getComputedStyle(disabledNavigationButton).cursor).toBe("not-allowed");
      expect(getComputedStyle(disabledNavigationButton).boxShadow).toBe("none");
    },
  );

  it("collapses alternating Pocket Atlas events into one readable narrow lane", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <CourseThemeProvider
        appearance="light"
        theme={{
          schemaVersion: 1,
          design: { id: "pocket-atlas", revision: "1" },
          colourSystem: { id: "pocket-atlas", revision: "1" },
          overrides: {},
        }}
      >
        <TimelineThemeSpecimen width={320} />
      </CourseThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-timeline__event") !== null);

    const timeline = requiredElement<HTMLElement>(host, ".sc-course-timeline");
    const event = requiredElement<HTMLElement>(host, ".sc-course-timeline__event");
    const card = requiredElement<HTMLElement>(host, ".sc-course-timeline__card");
    const dot = requiredElement<HTMLElement>(host, ".sc-course-timeline__dot");

    expect(getComputedStyle(event).gridTemplateColumns.split(" ")).toHaveLength(2);
    expect(card.getBoundingClientRect().width).toBeGreaterThan(270);
    expect(dot.getBoundingClientRect().right).toBeLessThan(card.getBoundingClientRect().left);
    expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(
      timeline.getBoundingClientRect().right + 1,
    );
  });

  it("supplies a complete square-edged chart recipe", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <CourseThemeProvider
        appearance="light"
        theme={{
          schemaVersion: 1,
          design: { id: "pocket-atlas", revision: "1" },
          colourSystem: { id: "pocket-atlas", revision: "1" },
          overrides: {},
        }}
      >
        <div className="sc-course-chart" data-testid="chart" />
      </CourseThemeProvider>,
    );

    await waitForCondition(() => host.querySelector('[data-testid="chart"]') !== null);

    const chart = requiredElement<HTMLElement>(host, '[data-testid="chart"]');
    expect(readChartTokens(chart)).toMatchObject({
      fontSizeAxis: 11,
      fontSizeCompact: 10,
      fontSizeSupporting: 12,
      fontSizeBody: 13,
      fontSizeTitle: 16,
      radiusBar: 0,
      radiusTooltip: 0,
      radiusPie: 0,
      symbolSize: 8,
      lineWidth: 3,
      emphasisScaleLine: 1.25,
      emphasisScaleSize: 6,
    });
  });
});

function ComparisonSpecimen({ id, width }: { id: string; width: number }) {
  const leftHeaderId = `${id}-left-header`;
  const rightHeaderId = `${id}-right-header`;

  return (
    <section className="sc-course-comparison" data-comparison={id} style={{ width }}>
      <div className="sc-course-comparison__surface">
        <div
          role="table"
          aria-label="Before compared with After"
          className="sc-course-comparison__table"
        >
          <div role="rowgroup" className="sc-course-comparison__header">
            <div role="row" className="sc-course-comparison__header-row">
              <span
                id={leftHeaderId}
                role="columnheader"
                className="sc-course-comparison__header-cell"
              >
                Before
              </span>
              <span
                id={rightHeaderId}
                role="columnheader"
                className="sc-course-comparison__header-cell"
              >
                After
              </span>
            </div>
          </div>
          <div role="rowgroup" className="sc-course-comparison__body">
            <div role="row" className="sc-course-comparison__row">
              <div
                role="cell"
                aria-labelledby={leftHeaderId}
                className="sc-course-comparison__cell sc-course-comparison__cell--left"
              >
                <span aria-hidden className="sc-course-comparison__cell-label">
                  Before
                </span>
                <div className="sc-course-comparison__cell-content ProseMirror">
                  <p
                    className="is-empty"
                    data-placeholder="Add comparison text"
                    data-testid="placeholder"
                  />
                </div>
              </div>
              <div
                role="cell"
                aria-labelledby={rightHeaderId}
                className="sc-course-comparison__cell sc-course-comparison__cell--right"
              >
                <span aria-hidden className="sc-course-comparison__cell-label">
                  After
                </span>
                <div className="sc-course-comparison__cell-content" data-testid="filled-content">
                  <p>One bounded workflow keeps intent aligned.</p>
                </div>
              </div>
              <div
                role="cell"
                aria-label="Actions for comparison row 1"
                className="sc-app-comparison-row-actions"
              >
                <button
                  type="button"
                  className="sc-app-comparison-delete"
                  aria-label="Delete comparison row 1"
                />
              </div>
            </div>
          </div>
        </div>
        <button type="button" className="sc-app-block-add sc-app-comparison-add">
          Add row
        </button>
      </div>
    </section>
  );
}

function FlashcardSpecimen() {
  return (
    <section
      className="sc-course-flashcard-block"
      data-flashcard-specimen=""
      style={{ width: 820 }}
    >
      <div className="sc-course-flashcard-deck">
        <div className="sc-course-flashcard-deck-header">
          <div className="sc-course-flashcard-deck-header__row">
            <span className="sc-course-flashcard-deck-header__status">
              Flip to study, rate as you go
            </span>
            <span className="sc-course-flashcard-deck-header__counter">1 / 3</span>
          </div>
          <div className="sc-course-flashcard-deck-header__progress" />
        </div>
        <div className="sc-course-flashcard-stack">
          <div className="sc-course-flashcard-card">
            <div className="sc-course-flashcard-card__surface">
              <div className="sc-course-flashcard-card__rotator">
                <div
                  className="sc-course-flashcard-side sc-course-flashcard-side--front"
                  data-flashcard-visible-face=""
                >
                  <span className="sc-course-flashcard-side__caption">Front</span>
                  <div className="sc-course-flashcard-side__inner">
                    <div className="sc-course-flashcard-side__content sc-course-flashcard-side__content--front">
                      <p>What is photosynthesis?</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="sc-course-flashcard-reader-controls">
          <div className="sc-course-flashcard-reader-controls__nav">
            <button
              aria-label="Previous card"
              className="sc-course-icon-action sc-course-flashcard-reader-controls__icon-button"
              type="button"
            >
              Previous
            </button>
            <button
              className="sc-course-action sc-course-flashcard-reader-controls__flip-button"
              type="button"
            >
              Flip card
            </button>
            <button
              aria-label="Next card"
              className="sc-course-icon-action sc-course-flashcard-reader-controls__icon-button"
              type="button"
            >
              Next
            </button>
          </div>
          <div className="sc-course-flashcard-reader-controls__ratings">
            <button className="sc-course-flashcard-rating-button" type="button">
              Not yet
            </button>
            <button className="sc-course-flashcard-rating-button" type="button">
              Got it
            </button>
          </div>
        </div>
      </div>
      <div className="sc-course-flashcard-mastered" data-course-state="completed">
        <p className="sc-course-flashcard-mastered__title">Deck complete.</p>
        <p className="sc-course-flashcard-mastered__body">Reset to study from the top.</p>
        <button className="sc-course-action sc-course-flashcard-mastered__reset" type="button">
          Reset deck
        </button>
      </div>
    </section>
  );
}

function QuizNavigationSpecimen() {
  return (
    <section className="sc-course-quiz" data-quiz-specimen="" style={{ width: 700 }}>
      <div className="sc-course-quiz__container">
        <header className="sc-course-quiz__header">
          <div className="sc-course-quiz__brand">
            <span aria-hidden className="sc-course-quiz__brand-mark">
              ✓
            </span>
            <span className="sc-course-quiz__brand-label">Quiz</span>
            <span className="sc-course-quiz__brand-meta">
              <span className="sc-course-quiz__brand-sep">·</span>
              <span className="sc-course-quiz__brand-count">2 questions</span>
              <span className="sc-course-quiz__brand-sep">·</span>
              <span className="sc-course-quiz__brand-points">2 pts</span>
            </span>
          </div>
        </header>
        <div className="sc-course-quiz__runtime-controls">
          <div className="sc-course-quiz__runtime-nav">
            <CourseButton
              aria-label="Previous question"
              className="sc-course-quiz__secondary-action"
              emphasis="outlined"
              size="large"
            >
              Previous
            </CourseButton>
            <CourseButton
              aria-label="Next question"
              className="sc-course-quiz__secondary-action"
              emphasis="outlined"
              size="large"
            >
              Next
            </CourseButton>
          </div>
          <CourseButton
            className="sc-course-quiz__primary-action"
            data-testid="quiz-primary"
            emphasis="strong"
            size="large"
          >
            Start quiz
          </CourseButton>
        </div>
      </div>
    </section>
  );
}

function TimelineThemeSpecimen({ width }: { width: number }) {
  return (
    <div className="sc-course-timeline" style={{ width }}>
      <section
        aria-label="Timeline"
        className="sc-course-timeline__shell"
        data-alignment="alternate"
        data-presentation="vertical"
        data-show-axis="true"
      >
        <div className="sc-course-timeline__track">
          <div className="sc-course-timeline__rail">
            <div aria-label="Timeline events" className="sc-course-timeline__events" role="list">
              {[
                ["1969", "First lunar landing", "Apollo 11 touches down."],
                ["1989", "World Wide Web proposed", "A new information system takes shape."],
              ].map(([date, title, description], index) => (
                <div
                  className={`sc-course-timeline__event sc-course-timeline__event--${index === 0 ? "left" : "right"}`}
                  data-timeline-event=""
                  key={date}
                  role="listitem"
                >
                  <span aria-hidden className="sc-course-timeline__dot" />
                  <div className="sc-course-timeline__card">
                    <div className="sc-course-timeline__content">
                      <div data-node-view-content-react="">
                        <p data-timeline-copy="date">{date}</p>
                        <p data-timeline-copy="title">{title}</p>
                        <p data-timeline-copy="description">{description}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <nav aria-label="Timeline navigation" className="sc-course-timeline__navigation">
          <button
            aria-label="Previous event"
            className="sc-course-timeline__navigation-button"
            disabled
            type="button"
          >
            Previous
          </button>
          <button
            aria-label="Next event"
            className="sc-course-timeline__navigation-button"
            type="button"
          >
            Next
          </button>
        </nav>
      </section>
    </div>
  );
}

function QuizRuntimeStatesSpecimen() {
  return (
    <section className="sc-course-quiz" data-quiz-runtime-states="" style={{ width: 700 }}>
      <div className="sc-course-quiz__runtime-card">
        <h3 className="sc-course-quiz__runtime-title">Ready to begin?</h3>
        <p className="sc-course-quiz__runtime-meta">Answers are submitted at the end.</p>
      </div>
      <div className="sc-course-quiz__runtime-incomplete">This quiz is incomplete.</div>
      <div className="sc-course-quiz__review-context">
        <span className="sc-course-quiz__review-context-label">Reviewing answers</span>
        <span className="sc-course-quiz__review-context-position">Question 1 of 2</span>
      </div>
      <div className="sc-course-quiz__request-feedback" data-course-state="info">
        Loading answer review…
      </div>
      <span className="sc-course-quiz__timer" data-course-state="warning">
        00:30
      </span>
      <div className="sc-course-quiz__completion" data-course-state="completed">
        <span className="sc-course-quiz__completion-mark">✓</span>
        <h3 className="sc-course-quiz__completion-title">Quiz complete</h3>
        <span className="sc-course-quiz__completion-score">2 / 2</span>
        <span className="sc-course-quiz__completion-meta">100%</span>
      </div>
      <div className="sc-course-quiz__expired" data-course-state="warning">
        <span className="sc-course-quiz__expired-mark">!</span>
        <h3 className="sc-course-quiz__expired-title">Time's up</h3>
        <p className="sc-course-quiz__expired-meta">Your attempt ended when time ran out.</p>
        <span className="sc-course-quiz__expired-score">1 / 2</span>
        <span className="sc-course-quiz__expired-percent">50%</span>
      </div>
      <div className="sc-course-quiz__timesup" data-course-state="warning">
        <span className="sc-course-quiz__timesup-mark">!</span>
        <span className="sc-course-quiz__timesup-label">Time's up</span>
      </div>
    </section>
  );
}

function requiredElement<ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const timeoutAt = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() >= timeoutAt) throw new Error("Timed out waiting for Pocket Atlas fixture");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseRgb(foreground));
  const backgroundLuminance = relativeLuminance(parseRgb(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastRatioWithOpacity(foreground: string, background: string, opacity: number): number {
  const foregroundChannels = parseRgb(foreground);
  const backgroundChannels = parseRgb(background);
  const composited = foregroundChannels.map((channel, index) =>
    Math.round(channel * opacity + backgroundChannels[index]! * (1 - opacity)),
  ) as [number, number, number];
  const foregroundLuminance = relativeLuminance(composited);
  const backgroundLuminance = relativeLuminance(backgroundChannels);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value: string): [number, number, number] {
  const channels = value
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3)
    throw new Error(`Expected an RGB colour, received ${value}`);
  return channels as [number, number, number];
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
