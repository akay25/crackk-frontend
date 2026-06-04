import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import Start from "./routes/Start";
import Setup from "./routes/Setup";
import Interview from "./routes/Interview";
import Report from "./routes/Report";
import RequireToken from "./lib/guard";

// Every route except "/" is guarded by the magic token (redirects to "/").
const router = createBrowserRouter([
  { path: "/", element: <Start /> },
  { path: "/setup", element: <RequireToken><Setup /></RequireToken> },
  { path: "/interview/:id", element: <RequireToken><Interview /></RequireToken> },
  { path: "/report/:id", element: <RequireToken><Report /></RequireToken> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
