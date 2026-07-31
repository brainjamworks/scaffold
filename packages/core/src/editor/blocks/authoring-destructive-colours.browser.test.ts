import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/editor/shell/authoring/ScaffoldAuthoringApp.css";
import "@/styles/globals.css";
import "@/ui/components/Button/Button.css";
import "@/ui/components/IconButton/IconButton.css";

import "./assessment/shared/chrome/assessment-hints.css";
import "./assessment/shared/chrome/choice-trailing-button.css";
import "./structured-content/checklist/Checklist.css";

afterEach(() => {
  document.body.replaceChildren();
});

describe("authoring destructive colours", () => {
  it("keeps destructive primitives on the application semantic inside a course theme", async () => {
    const course = createThemedAuthoringFixture();
    const button = appendButton(course, "sc-button", "Delete");
    button.dataset["variant"] = "danger";
    const iconButton = appendButton(course, "sc-icon-button", "Delete item");
    iconButton.dataset["variant"] = "danger";

    expect(getComputedStyle(button).backgroundColor).toBe("rgb(185, 28, 28)");
    expect(getComputedStyle(button).color).toBe("rgb(255, 255, 255)");

    await userEvent.hover(iconButton);
    expect(getComputedStyle(iconButton).color).toBe("rgb(185, 28, 28)");
  });

  it("keeps inline authoring delete controls on the application semantic", async () => {
    const course = createThemedAuthoringFixture();
    const checklistDelete = appendButton(course, "sc-checklist-item__delete", "Delete item");
    const hintDelete = appendButton(course, "sc-assessment-hint__delete", "Delete hint");
    const choiceDelete = appendButton(
      course,
      "sc-choice-trailing-button sc-choice-trailing-button--danger",
      "Delete choice",
    );

    for (const control of [checklistDelete, hintDelete, choiceDelete]) {
      await userEvent.hover(control);
      expect(getComputedStyle(control).color).toBe("rgb(185, 28, 28)");
    }
  });

  it("keeps learner remove actions on the course error semantic", async () => {
    const course = createThemedAuthoringFixture();
    const removeMatch = appendButton(
      course,
      "sc-choice-trailing-button sc-choice-trailing-button--course-danger",
      "Remove match",
    );

    await userEvent.hover(removeMatch);
    expect(getComputedStyle(removeMatch).color).toBe("rgb(220, 38, 38)");
  });
});

function createThemedAuthoringFixture(): HTMLDivElement {
  const application = document.createElement("div");
  application.className = "sc-scaffold-authoring-app";
  application.style.setProperty("--sc-app-color-error", "rgb(185 28 28)");
  application.style.setProperty("--sc-app-color-error-foreground", "rgb(255 255 255)");
  application.style.setProperty("--sc-app-color-error-background", "rgb(254 226 226)");
  application.style.setProperty("--sc-app-color-error-text", "rgb(153 27 27)");

  const course = document.createElement("div");
  course.className = "sc-course-theme-scope";
  course.style.setProperty("--color-secondary", "rgb(8 145 178)");
  course.style.setProperty("--color-secondary-foreground", "rgb(255 255 255)");
  course.style.setProperty("--color-error", "rgb(220 38 38)");
  course.style.setProperty("--color-error-foreground", "rgb(255 255 255)");
  course.style.setProperty("--color-muted", "rgb(241 245 249)");
  course.style.setProperty("--color-background", "rgb(255 255 255)");
  course.style.setProperty("--color-ink", "rgb(15 23 42)");
  application.append(course);
  document.body.append(application);
  return course;
}

function appendButton(parent: HTMLElement, className: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = label;
  button.style.transition = "none";
  parent.append(button);
  return button;
}
