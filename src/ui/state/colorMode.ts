import { useEffect, useState } from "react";

export type ColorMode = "system" | "light" | "dark";

/** Resolves "system" from the host page's data-theme (if any) or the OS preference. */
function systemIsDark(): boolean {
  const host = document.documentElement.getAttribute("data-theme");
  if (host === "dark") return true;
  if (host === "light") return false;
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Applies data-mode="light|dark" on <html> and keeps it in sync with system changes. */
export function useResolvedColorMode(mode: ColorMode): "light" | "dark" {
  const [sys, setSys] = useState(systemIsDark);
  useEffect(() => {
    if (mode !== "system") return;
    const mq = typeof matchMedia !== "undefined" ? matchMedia("(prefers-color-scheme: dark)") : null;
    const update = () => setSys(systemIsDark());
    mq?.addEventListener?.("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    update();
    return () => {
      mq?.removeEventListener?.("change", update);
      mo.disconnect();
    };
  }, [mode]);
  const resolved = mode === "system" ? (sys ? "dark" : "light") : mode;
  useEffect(() => {
    document.documentElement.setAttribute("data-mode", resolved);
  }, [resolved]);
  return resolved;
}
