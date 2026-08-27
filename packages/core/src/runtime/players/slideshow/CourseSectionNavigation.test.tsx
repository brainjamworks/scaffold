// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  CourseSectionNavigationItem,
  CurrentCourseSectionNavigation,
} from "./slideshow-navigation";
import { CourseSectionNavigation } from "./CourseSectionNavigation";

const SECTION_1 = EmbeddedNodeIdSchema.parse("section00001");
const SECTION_2 = EmbeddedNodeIdSchema.parse("section00002");
const SECTION_3 = EmbeddedNodeIdSchema.parse("section00003");
const SURFACE_1 = EmbeddedNodeIdSchema.parse("surface00001");
const SURFACE_2 = EmbeddedNodeIdSchema.parse("surface00002");
const SURFACE_3 = EmbeddedNodeIdSchema.parse("surface00003");

const currentCourseSection: CurrentCourseSectionNavigation = {
  id: SECTION_2,
  title: "Practice",
  index: 1,
  number: 2,
  count: 3,
  surfaceIndex: 0,
  surfaceNumber: 1,
  surfaceCount: 1,
};

const courseSectionItems: readonly CourseSectionNavigationItem[] = [
  {
    id: SECTION_1,
    title: "Practice",
    index: 0,
    number: 1,
    count: 3,
    firstSurfaceId: SURFACE_1,
    current: false,
  },
  {
    id: SECTION_2,
    title: "Practice",
    index: 1,
    number: 2,
    count: 3,
    firstSurfaceId: SURFACE_2,
    current: true,
  },
  {
    id: SECTION_3,
    title: "Review",
    index: 2,
    number: 3,
    count: 3,
    firstSurfaceId: SURFACE_3,
    current: false,
  },
];

afterEach(cleanup);

describe("CourseSectionNavigation", () => {
  it("shows current Course Section context and disambiguates repeated titles", async () => {
    const user = userEvent.setup();
    render(
      <CourseSectionNavigation
        currentCourseSection={currentCourseSection}
        courseSectionItems={courseSectionItems}
        onSelectSurface={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Practice, Course Section 2 of 3",
    });
    expect(trigger).toHaveClass("sc-icon-button");
    expect(trigger).toHaveAttribute("data-variant", "ghost");
    expect(trigger.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(trigger).not.toHaveTextContent("Practice");

    await user.click(trigger);

    const repeatedItems = screen.getAllByRole("menuitemradio", { name: /Practice/ });
    expect(repeatedItems).toHaveLength(2);
    expect(repeatedItems[0]).toHaveAccessibleName("Practice, Course Section 1 of 3");
    expect(repeatedItems[0]).toHaveAttribute("aria-checked", "false");
    expect(repeatedItems[1]).toHaveAccessibleName("Practice, Course Section 2 of 3");
    expect(repeatedItems[1]).toHaveAttribute("aria-checked", "true");
  });

  it("selects a section's first Surface with pointer input and closes the chooser", async () => {
    const user = userEvent.setup();
    const onSelectSurface = vi.fn();
    render(
      <CourseSectionNavigation
        currentCourseSection={currentCourseSection}
        courseSectionItems={courseSectionItems}
        onSelectSurface={onSelectSurface}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Practice, Course Section 2 of 3",
    });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitemradio", { name: "Review, Course Section 3 of 3" }));

    expect(onSelectSurface).toHaveBeenCalledOnce();
    expect(onSelectSurface).toHaveBeenCalledWith(SURFACE_3);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("opens, moves and selects with the keyboard", async () => {
    const user = userEvent.setup();
    const onSelectSurface = vi.fn();
    render(
      <CourseSectionNavigation
        currentCourseSection={currentCourseSection}
        courseSectionItems={courseSectionItems}
        onSelectSurface={onSelectSurface}
      />,
    );

    await user.tab();
    const trigger = screen.getByRole("button", {
      name: "Practice, Course Section 2 of 3",
    });
    expect(document.activeElement).toBe(trigger);
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onSelectSurface).toHaveBeenCalledWith(SURFACE_2);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("renders nothing without Course Section navigation state", () => {
    const { container } = render(
      <CourseSectionNavigation
        currentCourseSection={null}
        courseSectionItems={[]}
        onSelectSurface={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: /Course Section/ })).toBeNull();
  });

  it("keeps empty-only Course Sections inspectable without creating a jump target", async () => {
    const user = userEvent.setup();
    const onSelectSurface = vi.fn();
    const emptyItems: readonly CourseSectionNavigationItem[] = [
      {
        id: SECTION_1,
        title: "Introduction",
        index: 0,
        number: 1,
        count: 2,
        firstSurfaceId: null,
        current: false,
      },
      {
        id: SECTION_2,
        title: "Practice",
        index: 1,
        number: 2,
        count: 2,
        firstSurfaceId: null,
        current: false,
      },
    ];

    render(
      <CourseSectionNavigation
        currentCourseSection={null}
        courseSectionItems={emptyItems}
        onSelectSurface={onSelectSurface}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Course Sections, no slides" });
    await user.click(trigger);

    const firstSection = screen.getByRole("menuitemradio", {
      name: "Introduction, Course Section 1 of 2, no slides",
    });
    expect(firstSection).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("menuitemradio", {
        name: "Practice, Course Section 2 of 2, no slides",
      }),
    ).toBeInTheDocument();

    await user.click(firstSection);

    expect(onSelectSurface).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
