import React from "react";

/**
 * Reusable confirmation dialog rendered over a modal overlay.
 * Follows the same pattern as session-delete confirm in SessionSidebarItem.
 */
export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  subtitle?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { open, onCancel, onConfirm, title, subtitle, cancelLabel, confirmLabel, danger } = props;
  React.useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel, open]);

  if (!open) {
    return null;
  }

  const confirmClass = danger
    ? "UiConfirmDialog__confirm UiConfirmDialog__confirm--danger"
    : "UiConfirmDialog__confirm";

  return (
    <div
      className="UiModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="UiConfirmDialog">
        <p className="UiConfirmDialog__text">{title}</p>
        {subtitle && <p className="UiConfirmDialog__sub">{subtitle}</p>}
        <div className="UiConfirmDialog__actions">
          <button type="button" className="UiConfirmDialog__cancel" onClick={onCancel}>
            {cancelLabel ?? "Cancel"}
          </button>
          <button type="button" className={confirmClass} onClick={onConfirm} autoFocus>
            {confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
