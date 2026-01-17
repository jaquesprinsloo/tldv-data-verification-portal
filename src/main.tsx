import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

// Ensure the service worker is registered so the browser can show the install prompt
registerSW({
  immediate: true,
});

createRoot(document.getElementById("root")!).render(<App />);
