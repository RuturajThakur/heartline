import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { ApiError, apiFetch } from "../lib/api";
import { useSessionProfile } from "../hooks/useSessionProfile";

type BlockedUser = {
  userId: string;
  name: string;
  city: string;
  photoUrl: string | null;
  blockedAt: string;
};

const panelClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.76)] p-7 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const labelClass = "mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]";

function Avatar({
  src,
  label
}: {
  src: string | null;
  label: string;
}) {
  if (src) {
    return <img alt={label} className="h-16 w-16 rounded-[20px] object-cover" src={src} />;
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#db5b43]/14 text-lg font-semibold uppercase text-[#db5b43]">
      {label.slice(0, 1)}
    </div>
  );
}

export function BlockedPage() {
  const queryClient = useQueryClient();
  const { sessionQuery } = useSessionProfile();
  const blockedQuery = useQuery({
    queryKey: ["blocked-users"],
    queryFn: () => apiFetch<{ items: BlockedUser[] }>("/api/blocks"),
    enabled: sessionQuery.isSuccess
  });
  const unblockMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      apiFetch<{ ok: boolean }>(`/api/blocks/${targetUserId}/remove`, {
        method: "POST"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["blocked-users"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["discovery-feed"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["matches"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["conversations"]
      });
    }
  });

  if (sessionQuery.isError) {
    return <Navigate to="/" />;
  }

  if (sessionQuery.isLoading || sessionQuery.isPending) {
    return (
      <section className={panelClass}>
        <p className={labelClass}>Blocked</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] text-[#24162d]">
          Loading your blocked list.
        </h2>
      </section>
    );
  }

  return (
    <section className="grid gap-6">
      <div className={panelClass}>
        <p className={labelClass}>Blocked</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
          People you have blocked.
        </h2>
        <p className="mt-4 text-base leading-7 text-[#65556c]">
          Blocked people are hidden from discovery, matches, and chat. You can undo that here if needed.
        </p>
      </div>

      <div className={panelClass}>
        <div className="grid gap-4">
          {blockedQuery.data?.items.length ? (
            blockedQuery.data.items.map((user) => (
              <article
                className="flex flex-col gap-4 rounded-[24px] border border-white/80 bg-white/60 p-5 sm:flex-row sm:items-center sm:justify-between"
                key={user.userId}
              >
                <div className="flex items-center gap-4">
                  <Avatar label={user.name} src={user.photoUrl} />
                  <div>
                    <h3 className="font-serif text-2xl text-[#24162d]">{user.name}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#65556c]">{user.city}</p>
                    <p className="mt-1 text-sm leading-6 text-[#65556c]">
                      Blocked on {new Date(user.blockedAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="grid gap-2">
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
                    onClick={() => unblockMutation.mutate(user.userId)}
                    type="button"
                  >
                    {unblockMutation.isPending ? "Updating..." : "Unblock"}
                  </button>
                  {unblockMutation.error instanceof ApiError ? (
                    <p className="text-sm text-[#b53c27]">{unblockMutation.error.message}</p>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <p className="text-base leading-7 text-[#65556c]">
              You have not blocked anyone yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
