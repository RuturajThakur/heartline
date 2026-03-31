import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { useSessionProfile } from "../hooks/useSessionProfile";

type DiscoveryProfile = {
  id: string;
  name: string;
  age: number;
  city: string;
  bio: string;
  relationshipIntent: "long_term" | "short_term" | "figuring_it_out";
  prompt: string;
  tags: string[];
  photoUrl: string | null;
  photoUrls?: string[];
  voiceIntroUrl?: string | null;
  verificationStatus?: "unverified" | "pending" | "verified";
  saved?: boolean;
  matched: boolean;
};

type ReportReason =
  | "spam"
  | "harassment"
  | "fake_profile"
  | "inappropriate_content"
  | "other";

const panelClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.76)] p-7 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const cardClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.78)] p-6 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const labelClass = "mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]";
const reactionOptions = [
  { value: "profile", label: "Overall vibe" },
  { value: "photo", label: "Photo" },
  { value: "bio", label: "Bio" },
  { value: "prompt", label: "Prompt" }
] as const;

async function getDiscoveryFeed(filters: {
  minAge: number;
  maxAge: number;
  city: string;
  relationshipIntent: "" | "long_term" | "short_term" | "figuring_it_out";
}) {
  const searchParams = new URLSearchParams();

  searchParams.set("minAge", String(filters.minAge));
  searchParams.set("maxAge", String(filters.maxAge));

  if (filters.city.trim()) {
    searchParams.set("city", filters.city.trim());
  }

  if (filters.relationshipIntent) {
    searchParams.set("relationshipIntent", filters.relationshipIntent);
  }

  const data = await apiFetch<{ items: DiscoveryProfile[] }>(
    `/api/discovery?${searchParams.toString()}`
  );
  return data.items;
}

async function getSavedProfiles() {
  const data = await apiFetch<{ items: DiscoveryProfile[] }>("/api/discovery/saved");
  return data.items;
}

function Avatar({
  src,
  label,
  className
}: {
  src: string | null;
  label: string;
  className: string;
}) {
  if (src) {
    return <img alt={label} className={className} src={src} />;
  }

  return (
    <div
      aria-label={label}
      className={`${className} flex items-center justify-center bg-[#db5b43]/14 text-lg font-semibold uppercase text-[#db5b43]`}
    >
      {label.slice(0, 1)}
    </div>
  );
}

export function DiscoveryPage() {
  const queryClient = useQueryClient();
  const [pendingLikeId, setPendingLikeId] = useState<string | null>(null);
  const [pendingBlockId, setPendingBlockId] = useState<string | null>(null);
  const [activeProfileIndex, setActiveProfileIndex] = useState(0);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [reportTarget, setReportTarget] = useState<{
    userId: string;
    userName: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [reactionDrafts, setReactionDrafts] = useState<
    Record<string, { type: "profile" | "photo" | "bio" | "prompt"; note: string }>
  >({});
  const [discoveryFilters, setDiscoveryFilters] = useState({
    minAge: 21,
    maxAge: 45,
    city: "",
    relationshipIntent: "" as "" | "long_term" | "short_term" | "figuring_it_out"
  });
  const { sessionQuery, profileQuery, hasCompleteProfile } = useSessionProfile();

  const discoveryQuery = useQuery({
    queryKey: ["discovery-feed", discoveryFilters],
    queryFn: () => getDiscoveryFeed(discoveryFilters)
  });
  const savedProfilesQuery = useQuery({
    queryKey: ["saved-profiles"],
    queryFn: getSavedProfiles
  });

  const likeMutation = useMutation({
    mutationFn: ({
      targetUserId,
      reactionType,
      reactionNote
    }: {
      targetUserId: string;
      reactionType?: "profile" | "photo" | "bio" | "prompt";
      reactionNote?: string;
    }) =>
      apiFetch<{ ok: boolean; matched: boolean; matchId: string | null }>("/api/likes", {
        method: "POST",
        body: JSON.stringify({
          targetUserId,
          reactionType,
          reactionNote
        })
      }),
    onMutate: ({ targetUserId }) => {
      setPendingLikeId(targetUserId);
    },
    onSuccess: async () => {
      setReactionDrafts({});
      await queryClient.invalidateQueries({
        queryKey: ["discovery-feed"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["matches"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["conversations"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["incoming-likes"]
      });
    },
    onSettled: () => {
      setPendingLikeId(null);
    }
  });
  const saveProfileMutation = useMutation({
    mutationFn: ({ targetUserId, saved }: { targetUserId: string; saved: boolean }) =>
      apiFetch<{ ok: boolean; saved: boolean }>(`/api/discovery/${targetUserId}/save`, {
        method: saved ? "DELETE" : "POST"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["discovery-feed"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["saved-profiles"]
      });
    }
  });
  const passMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      apiFetch<{ ok: boolean }>(`/api/discovery/${targetUserId}/pass`, {
        method: "POST"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["discovery-feed"]
      });
    }
  });
  const blockMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      apiFetch<{ ok: boolean }>("/api/blocks", {
        method: "POST",
        body: JSON.stringify({
          targetUserId
        })
      }),
    onMutate: (targetUserId) => {
      setPendingBlockId(targetUserId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["discovery-feed"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["saved-profiles"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["matches"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["conversations"]
      });
    },
    onSettled: () => {
      setPendingBlockId(null);
    }
  });
  const reportMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          targetUserId: reportTarget?.userId,
          reason: reportReason,
          details: reportDetails
        })
      }),
    onSuccess: () => {
      setReportTarget(null);
      setReportReason("spam");
      setReportDetails("");
    }
  });

  useEffect(() => {
    const count = discoveryQuery.data?.length ?? 0;

    if (count === 0) {
      setActiveProfileIndex(0);
      setActivePhotoIndex(0);
      return;
    }

    if (activeProfileIndex >= count) {
      setActiveProfileIndex(0);
    }
  }, [activeProfileIndex, discoveryQuery.data]);

  useEffect(() => {
    setActivePhotoIndex(0);
  }, [activeProfileIndex]);

  if (sessionQuery.isError) {
    return <Navigate to="/" />;
  }

  if (
    sessionQuery.isLoading ||
    sessionQuery.isPending ||
    (sessionQuery.isSuccess && profileQuery.isPending && !profileQuery.data)
  ) {
    return (
      <section className="grid gap-6">
        <div className={panelClass}>
          <p className={labelClass}>Loading</p>
          <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
            Checking your profile setup.
          </h2>
        </div>
      </section>
    );
  }

  if (profileQuery.isSuccess && !hasCompleteProfile) {
    return <Navigate to="/onboarding" />;
  }

  function openReportModal(target: { userId: string; userName: string }) {
    setReportTarget(target);
    setReportReason("spam");
    setReportDetails("");
  }

  function getReactionDraft(profileId: string) {
    return reactionDrafts[profileId] ?? { type: "profile" as const, note: "" };
  }

  const activeProfile =
    discoveryQuery.data && discoveryQuery.data.length > 0
      ? discoveryQuery.data[Math.min(activeProfileIndex, discoveryQuery.data.length - 1)]
      : null;
  const activePhotoUrls =
    activeProfile?.photoUrls && activeProfile.photoUrls.length > 0
      ? activeProfile.photoUrls
      : activeProfile?.photoUrl
        ? [activeProfile.photoUrl]
        : [];
  const activePhotoUrl =
    activePhotoUrls.length > 0
      ? activePhotoUrls[Math.min(activePhotoIndex, activePhotoUrls.length - 1)]
      : null;

  return (
    <section className="grid gap-6">
      <div className={panelClass}>
        <p className={labelClass}>Discovery</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
          Browse profiles and keep a shortlist.
        </h2>
        <p className="mt-4 text-base leading-7 text-[#65556c]">
          Discovery now has its own space so you can filter, save, pass, and like without mixing
          that flow into matches and chat.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
        <aside className={`${panelClass} h-fit`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={labelClass}>Saved profiles</p>
              <h3 className="font-serif text-2xl text-[#24162d]">Your shortlist</h3>
            </div>
            <span className="rounded-full border border-[#24162d]/10 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#24162d]">
              {savedProfilesQuery.data?.length ?? 0} saved
            </span>
          </div>

          <div className="mt-5 grid gap-3">
            {savedProfilesQuery.data?.length ? (
              savedProfilesQuery.data.map((profile) => (
                <article
                  className="flex items-center gap-3 rounded-[20px] border border-[#24162d]/10 bg-white/70 p-3"
                  key={`saved-${profile.id}`}
                >
                  <Avatar
                    className="h-16 w-16 rounded-[18px] object-cover"
                    label={profile.name}
                    src={profile.photoUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#24162d]">
                      {profile.name}, {profile.age}
                    </p>
                    <p className="truncate text-sm text-[#65556c]">{profile.city}</p>
                  </div>
                  <button
                    className="rounded-full border border-[#24162d]/10 bg-white/60 px-3 py-2 text-xs font-semibold text-[#24162d]"
                    onClick={() =>
                      saveProfileMutation.mutate({
                        targetUserId: profile.id,
                        saved: true
                      })
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </article>
              ))
            ) : (
              <p className="text-sm leading-6 text-[#65556c]">
                Save profiles here when you want to revisit them before deciding.
              </p>
            )}
          </div>
        </aside>

        <div className="grid gap-6">
          <div className="grid gap-4 rounded-[24px] border border-white/80 bg-white/55 p-4 md:grid-cols-4">
            <label className="grid gap-2 text-sm text-[#65556c]">
              <span>Min age</span>
              <input
                className="rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                max={discoveryFilters.maxAge}
                min={18}
                onChange={(event) =>
                  setDiscoveryFilters((current) => ({
                    ...current,
                    minAge: Number(event.target.value)
                  }))
                }
                type="number"
                value={discoveryFilters.minAge}
              />
            </label>
            <label className="grid gap-2 text-sm text-[#65556c]">
              <span>Max age</span>
              <input
                className="rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                max={100}
                min={discoveryFilters.minAge}
                onChange={(event) =>
                  setDiscoveryFilters((current) => ({
                    ...current,
                    maxAge: Number(event.target.value)
                  }))
                }
                type="number"
                value={discoveryFilters.maxAge}
              />
            </label>
            <label className="grid gap-2 text-sm text-[#65556c]">
              <span>City</span>
              <input
                className="rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                onChange={(event) =>
                  setDiscoveryFilters((current) => ({
                    ...current,
                    city: event.target.value
                  }))
                }
                placeholder="Filter by city"
                type="text"
                value={discoveryFilters.city}
              />
            </label>
            <label className="grid gap-2 text-sm text-[#65556c]">
              <span>Intent</span>
              <select
                className="rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                onChange={(event) =>
                  setDiscoveryFilters((current) => ({
                    ...current,
                    relationshipIntent: event.target.value as typeof current.relationshipIntent
                  }))
                }
                value={discoveryFilters.relationshipIntent}
              >
                <option value="">Any intent</option>
                <option value="long_term">Long term</option>
                <option value="short_term">Short term</option>
                <option value="figuring_it_out">Figuring it out</option>
              </select>
            </label>
          </div>

          <div className="grid gap-5">
            {discoveryQuery.isLoading ? (
              <article className={cardClass}>
                <h3 className="font-serif text-2xl text-[#24162d]">Loading discovery feed...</h3>
              </article>
            ) : null}

            {discoveryQuery.isError ? (
              <article className={cardClass}>
                <h3 className="font-serif text-2xl text-[#24162d]">Discovery is not ready yet</h3>
                <p className="mt-3 text-base leading-7 text-[#65556c]">
                  Sign in, complete onboarding, and make sure the API is running.
                </p>
              </article>
            ) : null}

            {discoveryQuery.data?.length === 0 ? (
              <article className={cardClass}>
                <h3 className="font-serif text-2xl text-[#24162d]">No profiles left right now</h3>
                <p className="mt-3 text-base leading-7 text-[#65556c]">
                  Add another user profile from a second account, widen your filters, or finish
                  onboarding if this account has not created a profile yet.
                </p>
                <Link
                  className="mt-4 inline-flex w-fit items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
                  to="/onboarding"
                >
                  Go to onboarding
                </Link>
              </article>
            ) : null}

            {activeProfile ? (
              <article className={cardClass}>
                <div className="overflow-hidden rounded-[32px] bg-white">
                  <div className="relative">
                    <Avatar
                      className="aspect-[3/4] w-full object-cover"
                      label={activeProfile.name}
                      src={activePhotoUrl}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#120b14]/82 via-[#120b14]/38 to-transparent px-6 pb-6 pt-20 text-white">
                      <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                          <p className="text-[0.72rem] uppercase tracking-[0.16em] text-white/70">
                            Profile {activeProfileIndex + 1} of {discoveryQuery.data?.length ?? 0}
                          </p>
                          <h3 className="mt-2 font-serif text-[clamp(2rem,4vw,3rem)] leading-[0.95]">
                            {activeProfile.name}, {activeProfile.age}
                          </h3>
                          <p className="mt-2 text-sm uppercase tracking-[0.14em] text-white/78">
                            {activeProfile.city} • {activeProfile.relationshipIntent.replaceAll("_", " ")}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {activeProfile.verificationStatus === "verified" ? (
                            <span className="rounded-full bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#1a6b52]">
                              Verified
                            </span>
                          ) : activeProfile.verificationStatus === "pending" ? (
                            <span className="rounded-full bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#9a6400]">
                              Pending
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  {activePhotoUrls.length > 1 ? (
                    <div className="border-t border-[#24162d]/8 bg-[#fffaf4] px-4 py-4">
                      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                        {activePhotoUrls.map((photoUrl, index) => (
                          <button
                            className={
                              index === activePhotoIndex
                                ? "overflow-hidden rounded-[18px] border-2 border-[#24162d] bg-white shadow-[0_10px_30px_rgba(87,49,31,0.12)]"
                                : "overflow-hidden rounded-[18px] border border-[#24162d]/10 bg-white/70"
                            }
                            key={`${activeProfile.id}-photo-${index}`}
                            onClick={() => setActivePhotoIndex(index)}
                            type="button"
                          >
                            <img
                              alt={`${activeProfile.name} photo ${index + 1}`}
                              className="h-20 w-full object-cover"
                              src={photoUrl}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 p-4 sm:p-6">
                    <section className="rounded-[28px] bg-[#fffaf4] p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#db5b43]">
                        About me
                      </p>
                      <p className="mt-3 text-lg leading-8 text-[#4b3b4f]">{activeProfile.bio}</p>
                    </section>

                    <section className="rounded-[28px] bg-[#fffaf4] p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#db5b43]">
                        Prompt
                      </p>
                      <p className="mt-3 font-serif text-2xl leading-tight text-[#24162d]">
                        {activeProfile.prompt}
                      </p>
                    </section>

                    {activeProfile.voiceIntroUrl ? (
                      <section className="rounded-[28px] bg-[#fffaf4] p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#db5b43]">
                          Voice intro
                        </p>
                        <audio
                          className="mt-3 w-full"
                          controls
                          preload="none"
                          src={activeProfile.voiceIntroUrl}
                        />
                      </section>
                    ) : null}

                    <section className="rounded-[28px] bg-[#fffaf4] p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#db5b43]">
                        Looking for
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[22px] bg-white p-4">
                          <p className="text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]">
                            Intent
                          </p>
                          <p className="mt-2 text-base font-medium text-[#24162d]">
                            {activeProfile.relationshipIntent.replaceAll("_", " ")}
                          </p>
                        </div>
                        <div className="rounded-[22px] bg-white p-4">
                          <p className="text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]">
                            Location
                          </p>
                          <p className="mt-2 text-base font-medium text-[#24162d]">
                            {activeProfile.city}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <p className="text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]">
                          Interests
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {activeProfile.tags.map((tag) => (
                            <span
                              className="rounded-full border border-[#24162d]/10 bg-white px-3 py-2 text-sm font-medium text-[#24162d]"
                              key={tag}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </section>

                    <div className="rounded-[28px] border border-white/80 bg-white/55 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#db5b43]">
                        What stood out?
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {reactionOptions.map((option) => (
                          <button
                            className={
                              getReactionDraft(activeProfile.id).type === option.value
                                ? "rounded-full border border-[#24162d] bg-[#24162d] px-3 py-2 text-xs font-semibold text-white"
                                : "rounded-full border border-[#24162d]/10 bg-white/60 px-3 py-2 text-xs font-semibold text-[#24162d]"
                            }
                            key={option.value}
                            onClick={() =>
                              setReactionDrafts((current) => ({
                                ...current,
                                [activeProfile.id]: {
                                  type: option.value,
                                  note: current[activeProfile.id]?.note ?? ""
                                }
                              }))
                            }
                            type="button"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <input
                        className="mt-3 w-full rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-sm text-[#24162d] outline-none focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                        onChange={(event) =>
                          setReactionDrafts((current) => ({
                            ...current,
                            [activeProfile.id]: {
                              type: current[activeProfile.id]?.type ?? "profile",
                              note: event.target.value
                            }
                          }))
                        }
                        placeholder="Optional note that gets sent with your like."
                        type="text"
                        value={getReactionDraft(activeProfile.id).note}
                      />
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-4 py-3 text-sm font-semibold text-[#24162d] transition hover:-translate-y-0.5"
                        onClick={() => {
                          passMutation.mutate(activeProfile.id);
                          queryClient.setQueryData<DiscoveryProfile[]>(["discovery-feed"], (current) =>
                            (current ?? []).filter((entry) => entry.id !== activeProfile.id)
                          );
                        }}
                        type="button"
                      >
                        {passMutation.isPending ? "Passing..." : "Pass"}
                      </button>
                      <button
                        className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-4 py-3 text-sm font-semibold text-[#24162d] transition hover:-translate-y-0.5"
                        onClick={() =>
                          saveProfileMutation.mutate({
                            targetUserId: activeProfile.id,
                            saved: Boolean(activeProfile.saved)
                          })
                        }
                        type="button"
                      >
                        {activeProfile.saved ? "Saved" : "Save"}
                      </button>
                      <button
                        className="inline-flex items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-4 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
                        onClick={() =>
                          likeMutation.mutate({
                            targetUserId: activeProfile.id,
                            reactionType: getReactionDraft(activeProfile.id).type,
                            reactionNote: getReactionDraft(activeProfile.id).note.trim() || undefined
                          })
                        }
                        type="button"
                      >
                        {pendingLikeId === activeProfile.id ? "Sending like..." : "Like"}
                      </button>
                      <button
                        className="inline-flex items-center justify-center rounded-full border border-[#b53c27]/20 bg-[#fff1ed] px-4 py-3 text-sm font-semibold text-[#b53c27] transition hover:-translate-y-0.5"
                        onClick={() => blockMutation.mutate(activeProfile.id)}
                        type="button"
                      >
                        {pendingBlockId === activeProfile.id ? "Blocking..." : "Block"}
                      </button>
                      <button
                        className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-4 py-3 text-sm font-semibold text-[#24162d] transition hover:-translate-y-0.5"
                        onClick={() =>
                          openReportModal({
                            userId: activeProfile.id,
                            userName: activeProfile.name
                          })
                        }
                        type="button"
                      >
                        Report
                      </button>
                    </div>

                    {(discoveryQuery.data?.length ?? 0) > 1 ? (
                      <div className="flex flex-wrap gap-3 pt-2">
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-4 py-3 text-sm font-semibold text-[#24162d]"
                          disabled={activeProfileIndex === 0}
                          onClick={() => setActiveProfileIndex((current) => Math.max(current - 1, 0))}
                          type="button"
                        >
                          Previous profile
                        </button>
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-4 py-3 text-sm font-semibold text-[#24162d]"
                          disabled={activeProfileIndex >= (discoveryQuery.data?.length ?? 1) - 1}
                          onClick={() =>
                            setActiveProfileIndex((current) =>
                              Math.min(current + 1, (discoveryQuery.data?.length ?? 1) - 1)
                            )
                          }
                          type="button"
                        >
                          Next profile
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ) : null}
          </div>
        </div>
      </div>

      {reportTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#24162d]/70 px-4 py-8">
          <div className="w-full max-w-xl rounded-[32px] border border-white/15 bg-[#fff7ee] p-6 shadow-[0_28px_90px_rgba(36,22,45,0.32)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={labelClass}>Report profile</p>
                <h3 className="font-serif text-[clamp(1.5rem,3vw,2.2rem)] text-[#24162d]">
                  Report {reportTarget.userName}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#65556c]">
                  Pick the best reason and add any context that would help review the report.
                </p>
              </div>
              <button
                className="rounded-full border border-[#24162d]/10 bg-white/60 px-4 py-2 text-sm font-semibold text-[#24162d]"
                onClick={() => setReportTarget(null)}
                type="button"
              >
                Cancel
              </button>
            </div>

            <form
              className="mt-6 grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                reportMutation.mutate();
              }}
            >
              <label className="grid gap-2 text-sm text-[#65556c]">
                <span>Reason</span>
                <select
                  className="rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                  onChange={(event) => setReportReason(event.target.value as ReportReason)}
                  value={reportReason}
                >
                  <option value="spam">Spam</option>
                  <option value="harassment">Harassment</option>
                  <option value="fake_profile">Fake profile</option>
                  <option value="inappropriate_content">Inappropriate content</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm text-[#65556c]">
                <span>Details</span>
                <textarea
                  className="min-h-32 rounded-3xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none transition placeholder:text-[#65556c]/70 focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                  onChange={(event) => setReportDetails(event.target.value)}
                  placeholder="Add any useful context here."
                  value={reportDetails}
                />
              </label>

              {reportMutation.error instanceof ApiError ? (
                <p className="text-sm text-[#b53c27]">{reportMutation.error.message}</p>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-5 py-3 text-sm font-semibold text-[#24162d]"
                  onClick={() => setReportTarget(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
                  type="submit"
                >
                  {reportMutation.isPending ? "Submitting..." : "Submit report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
