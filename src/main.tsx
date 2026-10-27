import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { registerServiceWorker } from "@/lib/push";
import { App } from "@/router";
import "@/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
