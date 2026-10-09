import { useEffect, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** The elements Tab can reach inside `container`, in DOM order. */
function tabbable(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest("[inert]") && el.getClientRects().length > 0,
  );
}

interface Options {
  dialog: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** False while the dialog is animating out: focus has already gone back to where it came from. */
  present: boolean;
}

/**
 * Modal behaviour for the desk sheet:
 * - on open, remember the element that had focus (the opener) and move focus into the dialog;
 * - while open, the rest of the page is inert, so focus and screen readers stay inside;
 * - Tab wraps inside the dialog, and Esc closes it;
 * - on close, focus returns to the opener.
 * It also stops key presses reaching the page, so story shortcuts (arrows, D) do nothing while the desk is open
 * or while typing in its text box.
 */
export function useDialog({ dialog, onClose, present }: Options): { onKeyDown: (event: KeyboardEvent) => void } {
  useEffect(() => {
    if (!present) return;
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    const page = document.getElementById("root");
    page?.setAttribute("inert", "");
    dialog.current?.focus();
    return () => {
      page?.removeAttribute("inert");
      opener?.focus();
    };
  }, [dialog, present]);

  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    const container = dialog.current;
    if (event.key !== "Tab" || !container) return;
    const items = tabbable(container);
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) {
      event.preventDefault();
      container.focus();
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { onKeyDown };
}
