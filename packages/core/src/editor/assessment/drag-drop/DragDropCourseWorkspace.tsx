import * as Dialog from "@radix-ui/react-dialog";
import {
  forwardRef,
  useRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from "react";

import { CourseThemePortalBoundary } from "@/theme/course/CourseThemeProvider";
import { zIndex } from "@/ui/overlays/z-index";

export const DragDropCourseWorkspaceRoot = Dialog.Root;

export const DragDropCourseWorkspaceContent = forwardRef<
  ElementRef<typeof Dialog.Content>,
  Omit<ComponentPropsWithoutRef<typeof Dialog.Content>, "children" | "title"> & {
    children: ReactNode;
    description: ReactNode;
    title: ReactNode;
  }
>(function DragDropCourseWorkspaceContent(
  { children, description, onCloseAutoFocus, onOpenAutoFocus, title, ...props },
  ref,
) {
  const openerRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <Dialog.Portal>
      <CourseThemePortalBoundary>
        <div className="sc-course-drag-drop-workspace__portal" style={{ zIndex: zIndex.modal }}>
          <Dialog.Overlay className="sc-course-drag-drop-workspace__overlay" />
          <Dialog.Content
            {...props}
            ref={ref}
            className="sc-course-drag-drop-workspace"
            contentEditable={false}
            onCloseAutoFocus={(event) => {
              onCloseAutoFocus?.(event);
              if (event.defaultPrevented) return;
              event.preventDefault();
              const opener = openerRef.current;
              if (opener?.isConnected) opener.focus({ preventScroll: true });
              openerRef.current = null;
            }}
            onOpenAutoFocus={(event) => {
              const activeElement = document.activeElement;
              openerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
              onOpenAutoFocus?.(event);
              if (event.defaultPrevented) return;
              event.preventDefault();
              titleRef.current?.focus();
            }}
          >
            <header className="sc-course-drag-drop-workspace__header">
              <div>
                <Dialog.Title
                  ref={titleRef}
                  tabIndex={-1}
                  className="sc-course-drag-drop-workspace__title"
                >
                  {title}
                </Dialog.Title>
                <Dialog.Description className="sc-course-drag-drop-workspace__description">
                  {description}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" aria-label="Close expanded Drag and Drop workspace">
                  Close
                </button>
              </Dialog.Close>
            </header>
            {children}
          </Dialog.Content>
        </div>
      </CourseThemePortalBoundary>
    </Dialog.Portal>
  );
});

export const DragDropCourseWorkspace = {
  Content: DragDropCourseWorkspaceContent,
  Root: DragDropCourseWorkspaceRoot,
} as const;
