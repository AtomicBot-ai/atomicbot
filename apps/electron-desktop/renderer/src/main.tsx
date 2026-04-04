import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { HashRouter } from "react-router-dom";
import { App } from "./ui/app/App";
import { ErrorBoundary } from "./ui/app/ErrorBoundary";
import { Toaster } from "./ui/shared/Toaster";
import { WhatsNewModal } from "./ui/updates/WhatsNewModal";
import { BannerProvider } from "./ui/shared/banners/BannerContext";
import { store } from "./store/store";
import { initPosthogRenderer } from "./analytics";
import "./ui/styles/index.css";

// Initialize PostHog before rendering. Runs async so it does not block the first paint.
void (async () => {
  try {
    const api = window.openclawDesktop;
    if (api?.analyticsGet) {
      const { enabled, userId } = await api.analyticsGet();
      initPosthogRenderer(userId, enabled);
    }
  } catch {
    // Analytics init failure is non-critical; the app continues normally.
  }
})();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <HashRouter>
        <BannerProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
          <Toaster />
          <WhatsNewModal />
        </BannerProvider>
      </HashRouter>
    </Provider>
  </React.StrictMode>
);
