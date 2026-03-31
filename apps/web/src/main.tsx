import React from "react";
import ReactDOM from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { AppShell } from "./shell/AppShell";
import { BlockedPage } from "./routes/BlockedPage";
import { DiscoveryPage } from "./routes/DiscoveryFeedPage";
import { EditProfilePage } from "./routes/EditProfilePage";
import { HomePage } from "./routes/HomePage";
import { InboxPage } from "./routes/InboxPage";
import { LikesPage } from "./routes/LikesPage";
import { ModerationPage } from "./routes/ModerationPage";
import { NotificationsPage } from "./routes/NotificationsPage";
import { OnboardingPage } from "./routes/OnboardingPage";
import { ProductPage } from "./routes/ProductPage";
import { SettingsPage } from "./routes/SettingsPage";
import "./styles.css";

const queryClient = new QueryClient();

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  )
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage
});

const productRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/product",
  component: ProductPage
});

const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inbox",
  component: InboxPage
});

const discoveryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discovery",
  component: DiscoveryPage
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: OnboardingPage
});

const moderationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/moderation",
  component: ModerationPage
});

const blockedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/blocked",
  component: BlockedPage
});

const editProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/edit-profile",
  component: EditProfilePage
});

const likesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/likes",
  component: LikesPage
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage
});

const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  component: NotificationsPage
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  discoveryRoute,
  inboxRoute,
  productRoute,
  onboardingRoute,
  moderationRoute,
  blockedRoute,
  editProfileRoute,
  likesRoute,
  settingsRoute,
  notificationsRoute
]);

const router = createRouter({
  routeTree,
  context: {
    queryClient
  }
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);
