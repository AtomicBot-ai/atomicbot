import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { HashRouter } from "react-router-dom";
import { App } from "./ui/App";
import { Toaster } from "./ui/Toaster";
import { UpdateBanner } from "./ui/UpdateBanner";
import { store } from "./store/store";
import "./ui/styles.css";
import "./ui/Sidebar.css";
import "./ui/ChatTranscript.css";
import "./ui/UserMessageBubble.css";
import "./ui/AssistantMessage.css";
import "./ui/ChatComposer.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <HashRouter>
        <App />
        <Toaster />
        <UpdateBanner />
      </HashRouter>
    </Provider>
  </React.StrictMode>
);
