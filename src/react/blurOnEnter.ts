import type { KeyboardEvent } from "react";

/** Commit property fields by taking the existing blur path — do not call update again. */
export function blurOnEnter(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  event.currentTarget.blur();
}
