import * as DialogPrimitive from "@radix-ui/react-dialog";

import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";

export const Close = DialogPrimitive.Close;
export const Content = DialogPrimitive.Content;
export const Description = DialogPrimitive.Description;
export const Dialog = DialogPrimitive.Dialog;
export const DialogClose = DialogPrimitive.DialogClose;
export const DialogContent = DialogPrimitive.DialogContent;
export const DialogDescription = DialogPrimitive.DialogDescription;
export const DialogOverlay = DialogPrimitive.DialogOverlay;
export const DialogTitle = DialogPrimitive.DialogTitle;
export const DialogTrigger = DialogPrimitive.DialogTrigger;
export const Overlay = DialogPrimitive.Overlay;
export const Root = DialogPrimitive.Root;
export const Title = DialogPrimitive.Title;
export const Trigger = DialogPrimitive.Trigger;
export const WarningProvider = DialogPrimitive.WarningProvider;
export const createDialogScope: typeof DialogPrimitive.createDialogScope =
  DialogPrimitive.createDialogScope;

export function Portal(props: DialogPrimitive.DialogPortalProps) {
  const resolution = useOverlayBoundary();

  if (resolution.status === "pending") return null;
  if (resolution.status === "unscoped") return <DialogPrimitive.Portal {...props} />;

  return <DialogPrimitive.Portal {...props} container={resolution.environment.host} />;
}

export const DialogPortal = Portal;

export type {
  DialogCloseProps,
  DialogContentProps,
  DialogDescriptionProps,
  DialogOverlayProps,
  DialogPortalProps,
  DialogProps,
  DialogTitleProps,
  DialogTriggerProps,
} from "@radix-ui/react-dialog";
