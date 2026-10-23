import React from "react";
import { createRoot } from "react-dom/client";
import css from "./styles.css";
import { App } from "./app";

// Styles are injected as a <style> tag so the report's "Download HTML" can embed them.
// Pick the initial colour mode before first paint to avoid a light flash in dark mode.
const host = document.documentElement.getAttribute("data-theme");
const dark = host ? host === "dark" : typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.setAttribute("data-mode", dark ? "dark" : "light");
document.documentElement.setAttribute("data-accent", "electric");

const style = document.createElement("style");
style.textContent = css;
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
