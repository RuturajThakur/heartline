import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { useSessionProfile } from "../hooks/useSessionProfile";
import { ApiError, apiFetch } from "../lib/api";

type IncomingLike = {
  userId: string;
  createdAt: string;
  name: string;
  age: number;
  city: string;
  bio: string;
  relationshipIntent: "long_term" | "short_term" | "figuring_it_out";
  prompt: string;
  tags: string[];
  photoUrl: string | null;
  reactionType?: "profile" | "photo" | "bio" | "prompt" | null;
  reactionNote?: string | null;
};

const panelClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.76)] p-7 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const cardClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.78)] p-6 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const labelClass = "mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]";

function Avatar({
  src,
  label
}: {
  src: string | null;
  label: string;
}) {
  if (src) {
    return <img alt={label} className="mb-4 h-48 w-full rounded-[24px] object-cover" src={src} />;
  }

  return (
    <div className="mb-4 flex h-48 w-full items-center justify-center rounded-[24px] bg-[#db5b43]/14 text-3xl font-semibold uppercase text-[#db5b43]">
      {label.slice(0, 1)}
    </div>
  );
}

export function LikesPage() {
  const queryClient = useQueryClient();
  const { sessionQuery, profileQuery, hasCompleteProfile } = useSessionProfile();
  const likesQuery = useQuery({
    queryKey: ["incoming-likes"],
    queryFn: () => apiFetch<{ items: IncomingLike[] }>("/api/likes/incoming"),
    enabled: sessionQuery.isSuccess
  });

  const likeBackMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      apiFetch<{ ok: boolean; matched: boolean; matchId: string | null }>("/api/likes", {
        method: "POST",
        body: JSON.stringify({
          targetUserId
        })
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["incoming-likes"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["matches"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["conversations"]
      });
    }
  });

  const passMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      apiFetch<{ ok: boolean }>(`/api/likes/${targetUserId}/pass`, {
        method: "POST"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["incoming-likes"]
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
        <p className={labelClass}>Likes you</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] text-[#24162d]">
          Loading incoming likes.
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
        <p className={labelClass}>Likes you</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
          People who already liked your profile.
        </h2>
        <p className="mt-4 text-base leading-7 text-[#65556c]">
          Review incoming likes here, like back to create a match, or pass if it is not the right fit.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {likesQuery.data?.items.length ? (
          likesQuery.data.items.map((like) => (
            <article className={cardClass} key={like.userId}>
              <Avatar label={like.name} src={like.photoUrl} />
              <h3 className="font-serif text-2xl text-[#24162d]">
                {like.name} in {like.city}
              </h3>
              <p className="mt-2 text-sm uppercase tracking-[0.12em] text-[#db5b43]">
                {like.age} years old
              </p>
              <p className="mt-3 text-base leading-7 text-[#65556c]">{like.bio}</p>
              <p className="mt-3 text-sm font-medium uppercase tracking-[0.12em] text-[#db5b43]">
                {like.relationshipIntent.replaceAll("_", " ")}
              </p>
              {like.reactionNote ? (
                <div className="mt-4 rounded-[22px] border border-[#24162d]/10 bg-white/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#db5b43]">
                    Message with the like
                  </p>
                  <p className="mt-2 text-base leading-7 text-[#24162d]">{like.reactionNote}</p>
                </div>
              ) : null}
              <p className="mt-3 text-base leading-7 text-[#65556c]">{like.prompt}</p>
              <p className="mt-4 text-sm font-medium tracking-[0.02em] text-[#db5b43]">
                {like.tags.join(" / ")}
              </p>
              <p className="mt-3 text-sm text-[#65556c]">
                Liked you on {new Date(like.createdAt).toLocaleString()}
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-4 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
                  onClick={() => likeBackMutation.mutate(like.userId)}
                  type="button"
                >
                  {likeBackMutation.isPending ? "Matching..." : "Like back"}
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-4 py-3 text-sm font-semibold text-[#24162d] transition hover:-translate-y-0.5"
                  onClick={() => passMutation.mutate(like.userId)}
                  type="button"
                >
                  {passMutation.isPending ? "Passing..." : "Pass"}
                </button>
              </div>
            </article>
          ))
        ) : (
          <article className={cardClass}>
            <h3 className="font-serif text-2xl text-[#24162d]">No incoming likes right now</h3>
            <p className="mt-3 text-base leading-7 text-[#65556c]">
              Once someone likes your profile, they will show up here so you can decide what to do next.
            </p>
            <Link
              className="mt-4 inline-flex w-fit items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
              to="/product"
            >
              Back to product
            </Link>
          </article>
        )}
      </div>

      {likeBackMutation.error instanceof ApiError ? (
        <p className="text-sm text-[#b53c27]">{likeBackMutation.error.message}</p>
      ) : null}
      {passMutation.error instanceof ApiError ? (
        <p className="text-sm text-[#b53c27]">{passMutation.error.message}</p>
      ) : null}
    </section>
  );
}
