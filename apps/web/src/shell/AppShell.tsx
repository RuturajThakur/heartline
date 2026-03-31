import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { API_URL, apiFetch } from "../lib/api";
import {
  isProfileComplete,
  normalizeProfilePayload,
  type ProfilePayload,
  type SessionUser
} from "../lib/profile";

const navLinkBase =
  "rounded-full border border-[#24162d]/10 px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5";

export function AppShell({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const pathname = useRouterState({
    select: (state) => state.location.pathname
  });
  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: () => apiFetch<{ user: SessionUser }>("/api/auth/me"),
    retry: false
  });
  const profileQuery = useQuery({
    queryKey: ["dating-profile"],
    queryFn: async () => {
      const result = await apiFetch<{ profile: ProfilePayload | null }>("/api/profile");
      return result.profile ? normalizeProfilePayload(result.profile) : null;
    },
    enabled: sessionQuery.isSuccess
  });
  const conversationsSummaryQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () =>
      apiFetch<{
        items: Array<{ id: string; unreadCount: number }>;
        totalUnreadCount: number;
      }>("/api/conversations"),
    enabled: sessionQuery.isSuccess
  });
  const incomingLikesQuery = useQuery({
    queryKey: ["incoming-likes"],
    queryFn: () => apiFetch<{ items: Array<{ userId: string }> }>("/api/likes/incoming"),
    enabled: sessionQuery.isSuccess
  });
  const unreadCount = conversationsSummaryQuery.data?.totalUnreadCount ?? 0;
  const incomingLikesCount = incomingLikesQuery.data?.items.length ?? 0;
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<{ items: Array<{ id: string }>; unreadCount: number }>("/api/notifications"),
    enabled: sessionQuery.isSuccess
  });
  const notificationCount = notificationsQuery.data?.unreadCount ?? 0;
  const isSignedIn = Boolean(sessionQuery.data?.user);
  const accountStatus = sessionQuery.data?.user.status ?? null;
  const hasRestrictedAccount = accountStatus === "suspended" || accountStatus === "banned";
  const hasCompleteProfile = isProfileComplete(profileQuery.data ?? null);
  const isAdmin = sessionQuery.data?.user.role === "admin" && !hasRestrictedAccount;

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const source = new EventSource(`${API_URL}/api/events`, {
      withCredentials: true
    });

    function syncLiveData() {
      queryClient.invalidateQueries({
        queryKey: ["conversations"]
      });
      queryClient.invalidateQueries({
        queryKey: ["conversation-messages"]
      });
      queryClient.invalidateQueries({
        queryKey: ["notifications"]
      });
      queryClient.invalidateQueries({
        queryKey: ["incoming-likes"]
      });
      queryClient.invalidateQueries({
        queryKey: ["matches"]
      });
      queryClient.invalidateQueries({
        queryKey: ["discovery-feed"]
      });
    }

    source.addEventListener("message", syncLiveData);
    source.addEventListener("notification", syncLiveData);

    return () => {
      source.close();
    };
  }, [isSignedIn, queryClient]);

  return (
    <div className="mx-auto min-h-screen w-[min(1120px,calc(100%-32px))] py-8 pb-12">
      <header className="mb-7 grid gap-5 border-b border-white/40 pb-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]">
            Heartline
          </p>
          <h1 className="max-w-[10ch] font-serif text-[clamp(2.6rem,5vw,4.8rem)] leading-[0.98] text-[#24162d]">
            Build a dating app with an actual social graph.
          </h1>
        </div>

        <nav className="grid gap-3 md:auto-cols-max md:grid-flow-col md:items-center">
          <Link
            className={
              pathname === "/"
                ? `${navLinkBase} border-[#24162d] bg-[#24162d] text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)]`
                : `${navLinkBase} bg-white/60 text-[#24162d]`
            }
            to="/"
          >
            Vision
          </Link>
          {isSignedIn && !hasCompleteProfile && !hasRestrictedAccount ? (
            <Link
              className={
                pathname === "/onboarding"
                  ? `${navLinkBase} border-[#24162d] bg-[#24162d] text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)]`
                  : `${navLinkBase} bg-white/60 text-[#24162d]`
              }
              to="/onboarding"
            >
              Onboarding
            </Link>
          ) : null}
          {isSignedIn && hasCompleteProfile && !hasRestrictedAccount ? (
            <Link
              className={
                pathname === "/notifications"
                  ? `${navLinkBase} border-[#24162d] bg-[#24162d] text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)]`
                  : `${navLinkBase} bg-white/60 text-[#24162d]`
              }
              to="/notifications"
            >
              <span className="inline-flex items-center gap-2">
                Notifications
                {notificationCount > 0 ? (
                  <span className="rounded-full bg-[#db5b43] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-white">
                    {notificationCount}
                  </span>
                ) : null}
              </span>
            </Link>
          ) : null}
          {isSignedIn && hasCompleteProfile && !hasRestrictedAccount ? (
            <Link
              className={
                pathname === "/likes"
                  ? `${navLinkBase} border-[#24162d] bg-[#24162d] text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)]`
                  : `${navLinkBase} bg-white/60 text-[#24162d]`
              }
              to="/likes"
            >
              <span className="inline-flex items-center gap-2">
                Likes You
                {incomingLikesCount > 0 ? (
                  <span className="rounded-full bg-[#db5b43] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-white">
                    {incomingLikesCount}
                  </span>
                ) : null}
              </span>
            </Link>
          ) : null}
          {isSignedIn && hasCompleteProfile && !hasRestrictedAccount ? (
            <Link
              className={
                pathname === "/product"
                  ? `${navLinkBase} border-[#24162d] bg-[#24162d] text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)]`
                  : `${navLinkBase} bg-white/60 text-[#24162d]`
              }
              to="/product"
            >
              <span className="inline-flex items-center gap-2">
                Product
                {unreadCount > 0 ? (
                  <span className="rounded-full bg-[#db5b43] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-white">
                    {unreadCount}
                  </span>
                ) : null}
              </span>
            </Link>
          ) : null}
          {isSignedIn ? (
            <Link
              className={
                pathname === "/settings"
                  ? `${navLinkBase} border-[#24162d] bg-[#24162d] text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)]`
                  : `${navLinkBase} bg-white/60 text-[#24162d]`
              }
              to="/settings"
            >
              Settings
            </Link>
          ) : null}
          {isAdmin ? (
            <Link
              className={
                pathname === "/moderation"
                  ? `${navLinkBase} border-[#24162d] bg-[#24162d] text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)]`
                  : `${navLinkBase} bg-white/60 text-[#24162d]`
              }
              to="/moderation"
            >
              Moderation
            </Link>
          ) : null}
        </nav>
      </header>

      <main>{children}</main>
    </div>
  );
}
