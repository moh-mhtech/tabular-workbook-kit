import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
}

function getViewportWidth(): number {
  return window.innerWidth;
}

function getServerViewportWidth(): number {
  return 1280;
}

export function useViewportWidth(): number {
  return useSyncExternalStore(subscribe, getViewportWidth, getServerViewportWidth);
}
