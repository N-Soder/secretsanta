import './index.css';
import './i18n/config';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/dm-serif-display/400.css';
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { migrateBrowserDraft } from './utils/setupDraft';
import { Home } from './pages/Home';
import { Reveal } from './pages/Reveal';
import { Manage } from './pages/Manage';
try { migrateBrowserDraft(localStorage); } catch { /* Storage can be disabled. */ }

const router = createBrowserRouter([{
  path: "/",
  element: <Home />,
}, {
  path: "/manage/:code",
  element: <Manage />,
}, {
  path: "/s/:code",
  element: <Reveal />,
}], {
  // @ts-ignore
  basename: import.meta.env.BASE_URL,
});

const root = createRoot(document.getElementById("root")!);
root.render(
  <RouterProvider router={router} />
);
