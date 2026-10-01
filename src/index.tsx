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
import { Recover } from './pages/Recover';
import { Privacy } from './pages/Privacy';
import { NotFound, RouteError } from './pages/NotFound';
try { migrateBrowserDraft(localStorage); } catch { /* Storage can be disabled. */ }

const routes = [{
  path: "/",
  element: <Home />,
}, {
  path: "/manage/:code",
  element: <Manage />,
}, {
  path: "/s/:code",
  element: <Reveal />,
}, {
  path: "/recover",
  element: <Recover />,
}, {
  path: "/privacy",
  element: <Privacy />,
}, {
  path: "*",
  element: <NotFound />,
}];

const router = createBrowserRouter(routes.map(route => ({ ...route, errorElement: <RouteError /> })), {
  // @ts-ignore
  basename: import.meta.env.BASE_URL,
});

const root = createRoot(document.getElementById("root")!);
root.render(
  <RouterProvider router={router} />
);
