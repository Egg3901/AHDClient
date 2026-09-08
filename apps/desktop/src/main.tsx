import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { Briefing } from "./briefing/Briefing.js";
import { installDiagnosticCapture } from "./diagnostics.js";
import "./app.css";

installDiagnosticCapture();
const container = document.getElementById("root");
if (!container) throw new Error("Missing #root");
createRoot(container).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).get("view") === "briefing" ? <Briefing floating /> : <App />}
  </React.StrictMode>,
);
