import { Badge, Box, Button, Card, Flex, Heading, RadioCards, Text, Theme } from "@radix-ui/themes";
import { useState } from "react";

type CourseState = "correct" | "incorrect" | "current" | "completed" | "locked";
type ChoiceState = "neutral" | "selected" | "correct" | "incorrect";

const courseStateClass: Record<CourseState, string> = {
  correct: "sc-course-state sc-course-state--correct",
  incorrect: "sc-course-state sc-course-state--incorrect",
  current: "sc-course-state sc-course-state--current",
  completed: "sc-course-state sc-course-state--completed",
  locked: "sc-course-state sc-course-state--locked",
};

const flowTheme = {
  accentColor: "indigo",
  grayColor: "slate",
  panelBackground: "solid",
  radius: "large",
  scaling: "100%",
} as const;

const choices = [
  { id: "a", label: "The learner recalls a definition", result: undefined },
  { id: "b", label: "The learner connects ideas across contexts", result: undefined },
  { id: "c", label: "The learner repeats the example exactly", result: "correct" },
  { id: "d", label: "The learner skips reflection entirely", result: "incorrect" },
] as const;

export function RadixCourseProof() {
  return (
    <main className="proof-shell">
      <header className="proof-header">
        <p className="proof-kicker">ISOLATED IMPLEMENTATION SPIKE</p>
        <h1>Radix underneath. Scaffold on purpose.</h1>
        <p className="proof-intro">
          The same Flow lesson is rendered in two scoped appearances. Radix owns conventional
          controls and scales; Scaffold adds educational state and block identity.
        </p>
      </header>

      <div className="proof-comparison" aria-label="Light and dark course appearance comparison">
        <CourseAppearance appearance="light" />
        <CourseAppearance appearance="dark" />
      </div>
    </main>
  );
}

function CourseAppearance({ appearance }: { appearance: "light" | "dark" }) {
  const [selectedChoice, setSelectedChoice] = useState("b");
  const [revealed, setRevealed] = useState(false);

  return (
    <Theme {...flowTheme} appearance={appearance} className="sc-course">
      <article className="course-stage" data-appearance={appearance}>
        <Flex justify="between" align="center" gap="3" mb="6">
          <Box>
            <Text as="div" size="1" weight="bold" color="gray">
              LEARNING SCIENCE · 04
            </Text>
            <Heading as="h2" size="6" mt="1">
              Make memory active
            </Heading>
          </Box>
          <Badge size="2" variant="soft">
            {appearance}
          </Badge>
        </Flex>

        <CourseProgress />

        <Box mt="7">
          <Text as="div" size="1" weight="bold" color="gray" mb="2">
            CHECK YOUR UNDERSTANDING
          </Text>
          <Heading as="h3" size="4" mb="1">
            Which action demonstrates elaborative learning?
          </Heading>
          <Text as="p" size="2" color="gray" mb="4">
            Select an answer. Correct and incorrect feedback remain domain states, not palette
            choices in this component.
          </Text>

          <RadioCards.Root
            value={selectedChoice}
            onValueChange={setSelectedChoice}
            columns="1"
            gap="2"
            aria-label="Elaborative learning choices"
          >
            {choices.map((choice) => (
              <CourseChoice
                key={choice.id}
                value={choice.id}
                state={choice.result ?? (selectedChoice === choice.id ? "selected" : "neutral")}
              >
                {choice.label}
              </CourseChoice>
            ))}
          </RadioCards.Root>
        </Box>

        <Box mt="7">
          <Text as="div" size="1" weight="bold" color="gray" mb="2">
            RETRIEVAL CARD
          </Text>
          <CourseFlashcard revealed={revealed} onToggle={() => setRevealed((value) => !value)} />
        </Box>

        <Flex justify="between" align="center" gap="3" mt="7" wrap="wrap">
          <Text size="2" color="gray">
            6 min remaining
          </Text>
          <Button size="3">Continue lesson</Button>
        </Flex>
      </article>
    </Theme>
  );
}

function CourseChoice({
  value,
  state,
  children,
}: {
  value: string;
  state: ChoiceState;
  children: React.ReactNode;
}) {
  const feedbackState = state === "correct" || state === "incorrect" ? state : undefined;

  return (
    <RadioCards.Item
      value={value}
      className="course-choice"
      data-course-choice-state={state}
      data-course-state={feedbackState}
    >
      <Flex align="center" justify="between" gap="3" width="100%">
        <Text size="2" weight="medium">
          {children}
        </Text>
        <ChoiceLabel state={state} />
      </Flex>
    </RadioCards.Item>
  );
}

function ChoiceLabel({ state }: { state: ChoiceState }) {
  if (state === "neutral") return null;
  return (
    <span className="course-choice-label">
      {state === "selected" ? "Selected" : state === "correct" ? "Correct" : "Incorrect"}
    </span>
  );
}

function CourseProgress() {
  const steps: {
    label: string;
    state: Extract<CourseState, "current" | "completed" | "locked">;
  }[] = [
    { label: "Frame", state: "completed" },
    { label: "Practise", state: "current" },
    { label: "Reflect", state: "locked" },
  ];

  return (
    <nav aria-label="Lesson progress" className="course-progress">
      {steps.map((step, index) => (
        <div key={step.label} className={courseStateClass[step.state]}>
          <span className="course-progress-index">{index + 1}</span>
          <Text size="1" weight="bold">
            {step.label}
          </Text>
        </div>
      ))}
    </nav>
  );
}

function CourseFlashcard({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  return (
    <Card size="3" className="course-flashcard">
      <Flex direction="column" justify="between" gap="5" minHeight="190px">
        <Box>
          <Text as="div" size="1" weight="bold" className="course-flashcard-eyebrow">
            {revealed ? "BACK · EXPLANATION" : "FRONT · PROMPT"}
          </Text>
          <Heading as="h4" size="5" mt="3">
            {revealed
              ? "Retrieval strengthens access routes to knowledge."
              : "Why does recalling an idea improve later learning?"}
          </Heading>
          {revealed ? (
            <Text as="p" size="2" mt="3" color="gray">
              The effort of bringing an idea to mind makes future retrieval more fluent and exposes
              what still needs attention.
            </Text>
          ) : null}
        </Box>
        <Button variant="soft" onClick={onToggle} className="course-flashcard-action">
          {revealed ? "Return to prompt" : "Reveal explanation"}
        </Button>
      </Flex>
    </Card>
  );
}
