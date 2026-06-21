import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { NearAuthProvider } from "./contexts/NearAuth";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <NearAuthProvider>
      <App />
    </NearAuthProvider>
  </React.StrictMode>
);
