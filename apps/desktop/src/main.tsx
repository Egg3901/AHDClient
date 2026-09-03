import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { CountryOverviewPrototype } from "./prototypes/country-overview/CountryOverviewPrototype.js";
import "./app.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root");
const prototype = new URLSearchParams(window.location.search).get("prototype");
createRoot(container).render(
  <React.StrictMode>
    {import.meta.env.DEV && prototype === "country-overview" ? (
      <CountryOverviewPrototype />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
