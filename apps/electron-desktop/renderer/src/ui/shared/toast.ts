import toast from "react-hot-toast";

export { errorToMessage } from "@lib/error-format";

const defaultDuration = 3000;

export const toastStyles = {
  fontSize: 15,
  fontWeight: 500,
  letterSpacing: -0.15,
  minWidth: 150,
  overflow: "hidden",
};

/** Show an info toast. */
export function addToast(message: string): void {
  toast.success(message, { duration: defaultDuration, style: toastStyles });
}

/** Show an error toast. Use for API failures, gateway errors, etc. */
export function addToastError(message: unknown): void {
  const stringMessage = errorToMessage(message);
  console.error(message);
  toast.error(stringMessage, { duration: defaultDuration, style: toastStyles });
}
