import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { useSessionProfile } from "../hooks/useSessionProfile";
import { ApiError, apiFetch } from "../lib/api";

type NotificationItem = {
  id: string;
  type: "like" | "match" | "message";
  createdAt: string;
  title: string;
  body: string;
  targetPath: string;
  photoUrl: string | null;
  isRead: boolean;
  readAt: string | null;
};

const panelClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.76)] p-7 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const labelClass = "mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]";

function Avatar({ src, label }: { src: string | null; label: string }) {
  if (src) {
    return <img alt={label} className="h-16 w-16 rounded-[20px] object-cover" src={src} />;
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#db5b43]/14 text-lg font-semibold uppercase text-[#db5b43]">
      {label.slice(0, 1)}
    </div>
  );
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { sessionQuery, profileQuery, hasCompleteProfile } = useSessionProfile();
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<{ items: NotificationItem[]; unreadCount: number }>("/api/notifications"),
    enabled: sessionQuery.isSuccess
  });
  const readMutation = useMutation({
    mutationFn: (notificationId: string) =>
      apiFetch<{ ok: boolean }>(`/api/notifications/${notificationId}/read`, {
        method: "POST"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["notifications"]
      });
    }
  });
  const dismissMutation = useMutation({
    mutationFn: (notificationId: string) =>
      apiFetch<{ ok: boolean }>(`/api/notifications/${notificationId}/dismiss`, {
        method: "POST"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["notifications"]
      });
    }
  });

  if (sessionQuery.isError) {
    return <Navigate to="/" />;
  }

  if (
    sessionQuery.isLoading ||
    sessionQuery.isPending ||
    (sessionQuery.isSuccess && profileQuery.isPending && !profileQuery.data)
  ) {
    return (
      <section className={panelClass}>
        <p className={labelClass}>Notifications</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] text-[#24162d]">
          Loading notifications.
        </h2>
      </section>
    );
  }

  if (profileQuery.isSuccess && !hasCompleteProfile) {
    return <Navigate to="/onboarding" />;
  }

  return (
    <section className="grid gap-6">
      <div className={panelClass}>
        <p className={labelClass}>Notifications</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
          Everything new in one place.
        </h2>
        <p className="mt-4 text-base leading-7 text-[#65556c]">
          Likes, matches, and unread conversation activity show up here so you do not have to hunt through the app.
        </p>
      </div>

      <div className={panelClass}>
        <div className="grid gap-4">
          {notificationsQuery.data?.items.length ? (
            notificationsQuery.data.items.map((item) => (
              <article
                className={
                  item.isRead
                    ? "flex items-center gap-4 rounded-[24px] border border-white/80 bg-white/50 p-5"
                    : "flex items-center gap-4 rounded-[24px] border border-white/80 bg-white/70 p-5"
                }
                key={item.id}
              >
                <Avatar label={item.title} src={item.photoUrl} />
                <div>
                  <p className="text-sm uppercase tracking-[0.12em] text-[#db5b43]">
                    {item.type} {item.isRead ? "" : "new"}
                  </p>
                  <h3 className="font-serif text-2xl text-[#24162d]">{item.title}</h3>
                  <p className="mt-2 text-base leading-7 text-[#65556c]">{item.body}</p>
                  <p className="mt-2 text-sm text-[#65556c]">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                      className="inline-flex items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-4 py-2 text-sm font-semibold text-white"
                      onClick={() => {
                        if (!item.isRead) {
                          readMutation.mutate(item.id);
                        }
                      }}
                      to={item.targetPath}
                    >
                      Open
                    </Link>
                    {!item.isRead ? (
                      <button
                        className="rounded-full border border-[#24162d]/10 bg-white/60 px-4 py-2 text-sm font-semibold text-[#24162d]"
                        onClick={() => readMutation.mutate(item.id)}
                        type="button"
                      >
                        Mark read
                      </button>
                    ) : null}
                    <button
                      className="rounded-full border border-[#24162d]/10 bg-white/60 px-4 py-2 text-sm font-semibold text-[#24162d]"
                      onClick={() => dismissMutation.mutate(item.id)}
                      type="button"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="text-base leading-7 text-[#65556c]">
              No notifications yet. When people like you, match with you, or message you, they will appear here.
            </p>
          )}
        </div>
        {readMutation.error instanceof ApiError ? (
          <p className="mt-4 text-sm text-[#b53c27]">{readMutation.error.message}</p>
        ) : null}
        {dismissMutation.error instanceof ApiError ? (
          <p className="mt-4 text-sm text-[#b53c27]">{dismissMutation.error.message}</p>
        ) : null}
      </div>
    </section>
  );
}
