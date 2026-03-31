import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProfileShowcase } from "../components/ProfileShowcase";
import { ApiError, apiFetch } from "../lib/api";
import { useSessionProfile } from "../hooks/useSessionProfile";

type DiscoveryProfile = {
  id: string;
  name: string;
  age: number;
  city: string;
  distanceKm?: number | null;
  bio: string;
  relationshipIntent: "long_term" | "short_term" | "figuring_it_out";
  prompts?: Array<{ question: string; answer: string }>;
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
const minDiscoveryAge = 18;
const maxDiscoveryAge = 80;

async function getDiscoveryFeed(filters: {
  minAge: number;
  maxAge: number;
  city: string;
  distanceKm: number | null;
  relationshipIntent: "" | "long_term" | "short_term" | "figuring_it_out";
}) {
  const searchParams = new URLSearchParams();

  searchParams.set("minAge", String(filters.minAge));
  searchParams.set("maxAge", String(filters.maxAge));

  if (filters.city.trim()) {
    searchParams.set("city", filters.city.trim());
  }

  if (filters.distanceKm !== null) {
    searchParams.set("distanceKm", String(filters.distanceKm));
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
  const [passedProfileIds, setPassedProfileIds] = useState<string[]>([]);
  const [selectedSavedProfileId, setSelectedSavedProfileId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    userId: string;
    userName: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [reactionDrafts, setReactionDrafts] = useState<
    Record<string, { type: "profile" | "photo" | "bio" | "prompt"; note: string }>
  >({});
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [discoveryFilters, setDiscoveryFilters] = useState({
    minAge: 21,
    maxAge: 45,
    city: "",
    distanceKm: null as number | null,
    relationshipIntent: "" as "" | "long_term" | "short_term" | "figuring_it_out"
  });
  const [draftFilters, setDraftFilters] = useState({
    minAge: 21,
    maxAge: 45,
    city: "",
    distanceKm: null as number | null,
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
        queryKey: ["saved-profiles"]
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
    onSuccess: () => {
      // Keep the local deck intact for this session so users can navigate back after a pass.
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
      return;
    }

    if (activeProfileIndex >= count) {
      setActiveProfileIndex(0);
    }
  }, [activeProfileIndex, discoveryQuery.data]);

  useEffect(() => {
    if (!selectedSavedProfileId) {
      return;
    }

    const stillExists = (savedProfilesQuery.data ?? []).some(
      (profile) => profile.id === selectedSavedProfileId
    );

    if (!stillExists) {
      setSelectedSavedProfileId(null);
    }
  }, [savedProfilesQuery.data, selectedSavedProfileId]);

  useEffect(() => {
    if (!isFiltersOpen) {
      setDraftFilters(discoveryFilters);
    }
  }, [discoveryFilters, isFiltersOpen]);

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

  const activeFeedProfile =
    discoveryQuery.data && discoveryQuery.data.length > 0
      ? discoveryQuery.data[Math.min(activeProfileIndex, discoveryQuery.data.length - 1)]
      : null;
  const selectedSavedProfile =
    savedProfilesQuery.data?.find((profile) => profile.id === selectedSavedProfileId) ?? null;
  const activeProfile = selectedSavedProfile ?? activeFeedProfile;
  const showingSavedProfile = Boolean(selectedSavedProfile);
  const activeProfileWasPassed = activeProfile ? passedProfileIds.includes(activeProfile.id) : false;
  const ageRange = maxDiscoveryAge - minDiscoveryAge;
  const minThumbOffset = ((draftFilters.minAge - minDiscoveryAge) / ageRange) * 100;
  const maxThumbOffset = ((draftFilters.maxAge - minDiscoveryAge) / ageRange) * 100;
  const distanceFilterValue = draftFilters.distanceKm ?? 30;
  const maxDistanceKm = 300;
  const distanceThumbOffset = (distanceFilterValue / maxDistanceKm) * 100;
  const hasSavedDiscoveryLocation =
    typeof sessionQuery.data?.user.latitude === "number" &&
    typeof sessionQuery.data?.user.longitude === "number";

  function openReportModal(target: { userId: string; userName: string }) {
    setReportTarget(target);
    setReportReason("spam");
    setReportDetails("");
  }

  function getReactionDraft(profileId: string) {
    return reactionDrafts[profileId] ?? { type: "profile" as const, note: "" };
  }

  function goToNextProfileAfterPass() {
    const count = discoveryQuery.data?.length ?? 0;

    if (count <= 1) {
      return;
    }

    if (activeProfileIndex < count - 1) {
      setActiveProfileIndex(activeProfileIndex + 1);
      return;
    }

    setActiveProfileIndex(Math.max(activeProfileIndex - 1, 0));
  }

  function applyFilters() {
    setLocationError(null);

    if (draftFilters.distanceKm !== null && !hasSavedDiscoveryLocation) {
      setLocationError("Set your discovery location in Settings before using distance.");
      return;
    }

    setDiscoveryFilters(draftFilters);
    setIsFiltersOpen(false);
  }

  return (
    <section className="grid gap-6">
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
                  className={
                    selectedSavedProfileId === profile.id
                      ? "flex items-center gap-3 rounded-[20px] border border-[#24162d] bg-[#fff4ea] p-3 shadow-[0_18px_40px_rgba(87,49,31,0.12)]"
                      : "flex items-center gap-3 rounded-[20px] border border-[#24162d]/10 bg-white/70 p-3"
                  }
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
                    className="rounded-full border border-[#24162d]/10 bg-white/80 px-3 py-2 text-xs font-semibold text-[#24162d]"
                    onClick={() => setSelectedSavedProfileId(profile.id)}
                    type="button"
                  >
                    View
                  </button>
                  <button
                    className="rounded-full border border-[#24162d]/10 bg-white/60 px-3 py-2 text-xs font-semibold text-[#24162d]"
                    onClick={() => {
                      if (selectedSavedProfileId === profile.id) {
                        setSelectedSavedProfileId(null);
                      }

                      saveProfileMutation.mutate({
                        targetUserId: profile.id,
                        saved: true
                      });
                    }}
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
          <div className="flex items-center justify-between gap-4">
            <button
              className="inline-flex items-center gap-3 rounded-full border border-[#24162d]/10 bg-white/70 px-4 py-3 text-sm font-semibold text-[#24162d] transition hover:-translate-y-0.5"
              onClick={() => setIsFiltersOpen(true)}
              type="button"
            >
              <span aria-hidden="true" className="text-lg leading-none">≡</span>
              Filters
            </button>

            <p className="text-sm text-[#65556c]">
              Ages {discoveryFilters.minAge}-{discoveryFilters.maxAge}
              {discoveryFilters.distanceKm !== null
                ? ` • within ${discoveryFilters.distanceKm} km`
                : ""}
              {discoveryFilters.city.trim() ? ` • ${discoveryFilters.city.trim()}` : ""}
              {discoveryFilters.relationshipIntent
                ? ` • ${discoveryFilters.relationshipIntent.replaceAll("_", " ")}`
                : ""}
            </p>
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

            {discoveryQuery.data?.length === 0 && !selectedSavedProfile ? (
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
                <ProfileShowcase
                  bio={activeProfile.bio}
                  city={activeProfile.city}
                  emptyBioText="No bio added yet."
                  headerLabel=""
                  interestEmptyText="No interests listed yet."
                  interests={activeProfile.tags}
                  name={`${activeProfile.name}, ${activeProfile.age}`}
                  photoUrls={activeProfile.photoUrls ?? (activeProfile.photoUrl ? [activeProfile.photoUrl] : [])}
                  promptFallbackText="No prompt answer yet."
                  prompts={
                    activeProfile.prompts?.length
                      ? activeProfile.prompts
                      : [
                          {
                            question: "",
                            answer: activeProfile.prompt
                          }
                        ]
                  }
                  relationshipIntent={activeProfile.relationshipIntent}
                  verificationStatus={activeProfile.verificationStatus}
                  voiceIntroUrl={activeProfile.voiceIntroUrl}
                >
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
                        setPassedProfileIds((current) =>
                          current.includes(activeProfile.id)
                            ? current
                            : [...current, activeProfile.id]
                        );
                        if (showingSavedProfile) {
                          setSelectedSavedProfileId(null);
                        }
                        goToNextProfileAfterPass();
                      }}
                      type="button"
                    >
                      {passMutation.isPending
                        ? "Passing..."
                        : activeProfileWasPassed
                          ? "Passed"
                          : "Pass"}
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

                  {!showingSavedProfile && (discoveryQuery.data?.length ?? 0) > 1 ? (
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
                </ProfileShowcase>
              </article>
            ) : null}
          </div>
        </div>
      </div>

      {isFiltersOpen ? (
        <div className="fixed inset-0 z-40 bg-[#24162d]/26" onClick={() => setIsFiltersOpen(false)}>
          <div className="flex min-h-full items-start justify-center px-4 py-8 sm:justify-start">
            <div
              className="w-full max-w-[28rem] rounded-[32px] border border-white/80 bg-[rgba(255,251,246,0.96)] p-8 shadow-[0_28px_90px_rgba(36,22,45,0.22)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#24162d]">
                  Filters
                </p>
                <button
                  className="rounded-full p-2 text-xl leading-none text-[#65556c] transition hover:bg-[#24162d]/6"
                  onClick={() => setIsFiltersOpen(false)}
                  type="button"
                >
                  ×
                </button>
              </div>

              <div className="mt-6 grid gap-7">
                <label className="grid gap-3 text-sm text-[#65556c]">
                  <span>Age</span>
                  <div className="rounded-[28px] border border-[#24162d]/10 bg-white/80 p-5">
                    <p className="text-lg text-[#24162d]">
                      Between {draftFilters.minAge} and {draftFilters.maxAge}
                    </p>
                    <div className="mt-5">
                      <div className="relative h-10">
                        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-[#24162d]/12" />
                        <div
                          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#db5b43]"
                          style={{
                            left: `${minThumbOffset}%`,
                            right: `${100 - maxThumbOffset}%`
                          }}
                        />
                        <input
                          className="heartline-range absolute inset-0 w-full"
                          max={maxDiscoveryAge}
                          min={minDiscoveryAge}
                          onChange={(event) =>
                            setDraftFilters((current) => ({
                              ...current,
                              minAge: Math.min(Number(event.target.value), current.maxAge - 1)
                            }))
                          }
                          type="range"
                          value={draftFilters.minAge}
                        />
                        <input
                          className="heartline-range absolute inset-0 w-full"
                          max={maxDiscoveryAge}
                          min={minDiscoveryAge}
                          onChange={(event) =>
                            setDraftFilters((current) => ({
                              ...current,
                              maxAge: Math.max(Number(event.target.value), current.minAge + 1)
                            }))
                          }
                          type="range"
                          value={draftFilters.maxAge}
                        />
                      </div>
                    </div>
                  </div>
                </label>

                <label className="grid gap-3 text-sm text-[#65556c]">
                  <span>Distance</span>
                  <div className="rounded-[28px] border border-[#24162d]/10 bg-white/80 p-5">
                    <p className="text-lg text-[#24162d]">Within {distanceFilterValue} km</p>
                    <div className="mt-5">
                      <div className="relative h-10">
                        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-[#24162d]/12" />
                        <div
                          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#db5b43]"
                          style={{
                            width: `${distanceThumbOffset}%`
                          }}
                        />
                        <input
                          className="heartline-range absolute inset-0 w-full"
                          max={maxDistanceKm}
                          min={1}
                          onChange={(event) =>
                            setDraftFilters((current) => ({
                              ...current,
                              distanceKm: Number(event.target.value)
                            }))
                          }
                          type="range"
                          value={distanceFilterValue}
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-xs leading-5 text-[#65556c]">
                        Uses the discovery location saved to your account. It stays put until you
                        change it.
                      </p>
                      {draftFilters.distanceKm !== null ? (
                        <button
                          className="rounded-full border border-[#24162d]/10 bg-white px-3 py-2 text-xs font-semibold text-[#24162d]"
                          onClick={() =>
                            setDraftFilters((current) => ({
                              ...current,
                              distanceKm: null
                            }))
                          }
                          type="button"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                  </div>
                </label>

                <label className="grid gap-3 text-sm text-[#65556c]">
                  <span>City</span>
                  <div className="rounded-[28px] border border-[#24162d]/10 bg-white/80 p-5">
                    <input
                      className="w-full rounded-2xl border border-[#24162d]/10 bg-white px-4 py-3 text-[#24162d] outline-none focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                      onChange={(event) =>
                        setDraftFilters((current) => ({
                          ...current,
                          city: event.target.value
                        }))
                      }
                      placeholder="Filter by city"
                      type="text"
                      value={draftFilters.city}
                    />
                  </div>
                </label>

                <label className="grid gap-3 text-sm text-[#65556c]">
                  <span>Intent</span>
                  <div className="rounded-[28px] border border-[#24162d]/10 bg-white/80 p-2">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { value: "", label: "Any" },
                        { value: "long_term", label: "Long term" },
                        { value: "short_term", label: "Short term" },
                        { value: "figuring_it_out", label: "Figuring it out" }
                      ].map((option) => (
                        <button
                          className={
                            draftFilters.relationshipIntent === option.value
                              ? "rounded-full bg-[#24162d] px-4 py-3 text-sm font-semibold text-white"
                              : "rounded-full px-4 py-3 text-sm font-semibold text-[#6d6a70]"
                          }
                          key={option.label}
                          onClick={() =>
                            setDraftFilters((current) => ({
                              ...current,
                              relationshipIntent: option.value as typeof current.relationshipIntent
                            }))
                          }
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </label>
              </div>

              {locationError ? (
                <p className="mt-5 text-sm text-[#b53c27]">{locationError}</p>
              ) : null}

              <div className="mt-8 flex items-center justify-end gap-3">
                <Link
                  className="rounded-full px-5 py-3 text-sm font-semibold text-[#65556c]"
                  onClick={() => setIsFiltersOpen(false)}
                  to="/settings"
                >
                  Location settings
                </Link>
                <button
                  className="rounded-full px-5 py-3 text-sm font-semibold text-[#65556c]"
                  onClick={() => {
                    setLocationError(null);
                    setDraftFilters(discoveryFilters);
                    setIsFiltersOpen(false);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-[#24162d] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(36,22,45,0.24)]"
                  onClick={applyFilters}
                  type="button"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
