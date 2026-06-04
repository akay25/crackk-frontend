import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import Start from "./routes/Start";
import Setup from "./routes/Setup";
import Interview from "./routes/Interview";
import Report from "./routes/Report";

const router = createBrowserRouter([
  { path: "/", element: <Start /> },
  { path: "/setup", element: <Setup /> },
  { path: "/interview/:id", element: <Interview /> },
  { path: "/report/:id", element: <Report /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
