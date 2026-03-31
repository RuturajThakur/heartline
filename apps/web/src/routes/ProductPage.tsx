import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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

type MatchSummary = {
  id: string;
  createdAt: string;
  otherUserId: string;
  otherUserName: string;
  otherUserPhotoUrl: string | null;
  otherUserPhotoUrls?: string[];
};

type ConversationSummary = {
  id: string;
  matchId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserPhotoUrl: string | null;
  otherUserPhotoUrls?: string[];
  updatedAt: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageSenderUserId: string | null;
  unreadCount: number;
};

type ConversationMessage = {
  id: string;
  senderUserId: string;
  content: string;
  createdAt: string;
};

type ReportReason =
  | "spam"
  | "harassment"
  | "fake_profile"
  | "inappropriate_content"
  | "other";

const phases = [
  {
    title: "Identity",
    status: "Done",
    body: "Onboarding, edit profile, multi-photo profiles, prompts, interests, relationship intent, voice intros, and verification requests are now live."
  },
  {
    title: "Discovery",
    status: "Done",
    body: "Ranked discovery, filters, pass memory, saved profiles, profile photos, voice intros, and element-level reactions are now part of the feed."
  },
  {
    title: "Connection",
    status: "Done",
    body: "Matches, chat, starter prompts, unread state, notifications, block, report, and moderation controls are already in the product."
  },
  {
    title: "Social Layer",
    status: "Not started",
    body: "Circles, status updates, event prompts, and friend-assisted discovery are still future product work."
  }
] as const;

const panelClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.76)] p-7 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const cardClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.78)] p-6 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const labelClass = "mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]";
const starterPrompts = [
  "What made you swipe right on my profile?",
  "What does your ideal weekend usually look like?",
  "What are you looking forward to this month?"
] as const;
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

async function getMatches() {
  const data = await apiFetch<{ items: MatchSummary[] }>("/api/matches");
  return data.items;
}

async function getSavedProfiles() {
  const data = await apiFetch<{ items: DiscoveryProfile[] }>("/api/discovery/saved");
  return data.items;
}

async function getConversations() {
  return apiFetch<{
    items: ConversationSummary[];
    totalUnreadCount: number;
  }>("/api/conversations");
}

async function getConversationMessages(conversationId: string) {
  const data = await apiFetch<{ items: ConversationMessage[] }>(
    `/api/conversations/${conversationId}/messages`
  );
  return data.items;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "No messages yet";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getPhaseStatusClass(status: string) {
  if (status === "Done") {
    return "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-emerald-700";
  }

  if (status === "In progress") {
    return "rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-amber-700";
  }

  return "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-600";
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

export function ProductPage() {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const conversationMenuRef = useRef<HTMLDivElement | null>(null);
  const [pendingLikeId, setPendingLikeId] = useState<string | null>(null);
  const [pendingBlockId, setPendingBlockId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [isConversationMenuOpen, setIsConversationMenuOpen] = useState(false);
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
  const matchesQuery = useQuery({
    queryKey: ["matches"],
    queryFn: getMatches
  });
  const savedProfilesQuery = useQuery({
    queryKey: ["saved-profiles"],
    queryFn: getSavedProfiles
  });
  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: getConversations,
    refetchInterval: 12_000
  });
  const messagesQuery = useQuery({
    queryKey: ["conversation-messages", selectedConversationId],
    queryFn: () => getConversationMessages(selectedConversationId!),
    enabled: Boolean(selectedConversationId),
    refetchInterval: selectedConversationId ? 8_000 : false
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
        queryKey: ["likes-incoming"]
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
  const sendMessageMutation = useMutation({
    mutationFn: (conversationId: string) =>
      apiFetch<{ message: ConversationMessage }>(
        `/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: messageInput
          })
        }
      ),
    onSuccess: async (_, conversationId) => {
      setMessageInput("");
      await queryClient.invalidateQueries({
        queryKey: ["conversation-messages", conversationId]
      });
      await queryClient.invalidateQueries({
        queryKey: ["conversations"]
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
      setSelectedConversationId(null);
      setIsConversationMenuOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["discovery-feed"]
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
  const unmatchMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      apiFetch<{ ok: boolean }>("/api/unmatch", {
        method: "POST",
        body: JSON.stringify({
          targetUserId
        })
      }),
    onSuccess: async () => {
      setSelectedConversationId(null);
      setIsConversationMenuOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["matches"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["conversations"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["discovery-feed"]
      });
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
      setIsConversationMenuOpen(false);
    }
  });

  useEffect(() => {
    if (!conversationsQuery.data?.items.length) {
      setSelectedConversationId(null);
      return;
    }

    const hasSelectedConversation = conversationsQuery.data.items.some(
      (conversation) => conversation.id === selectedConversationId
    );

    if (!selectedConversationId || !hasSelectedConversation) {
      setSelectedConversationId(conversationsQuery.data.items[0].id);
    }
  }, [conversationsQuery.data, selectedConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [messagesQuery.data, selectedConversationId]);

  useEffect(() => {
    setIsConversationMenuOpen(false);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!isConversationMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!conversationMenuRef.current?.contains(event.target as Node)) {
        setIsConversationMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isConversationMenuOpen]);

  useEffect(() => {
    if (selectedConversationId && messagesQuery.data) {
      queryClient.invalidateQueries({
        queryKey: ["conversations"]
      });
    }
  }, [messagesQuery.data, queryClient, selectedConversationId]);

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
          <p className="mt-4 text-base leading-7 text-[#65556c]">
            We are making sure your onboarding is complete before opening discovery.
          </p>
        </div>
      </section>
    );
  }

  if (profileQuery.isSuccess && !hasCompleteProfile) {
    return <Navigate to="/onboarding" />;
  }

  const selectedConversation =
    conversationsQuery.data?.items.find((conversation) => conversation.id === selectedConversationId) ??
    null;

  function openReportModal(target: { userId: string; userName: string }) {
    setReportTarget(target);
    setReportReason("spam");
    setReportDetails("");
  }

  function getReactionDraft(profileId: string) {
    return reactionDrafts[profileId] ?? { type: "profile" as const, note: "" };
  }

  return (
    <section className="grid gap-6">
      <div className={panelClass}>
        <p className={labelClass}>MVP roadmap</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
          What we build first.
        </h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {phases.map((phase, index) => (
            <article className={cardClass} key={phase.title}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#db5b43]/14 text-sm font-bold text-[#db5b43]">
                  0{index + 1}
                </span>
                <span
                  className={getPhaseStatusClass(phase.status)}
                >
                  {phase.status}
                </span>
              </div>
              <h3 className="font-serif text-2xl text-[#24162d]">{phase.title}</h3>
              <p className="mt-3 text-base leading-7 text-[#65556c]">{phase.body}</p>
            </article>
          ))}
        </div>
      </div>

      <div className={panelClass}>
        <p className={labelClass}>Discovery</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
          Real profiles, real likes, first matches.
        </h2>
        <p className="mt-4 text-base leading-7 text-[#65556c]">
          This feed now comes from saved onboarding profiles in Postgres. Like a
          profile to create the first real dating loop. Mutual likes become matches.
        </p>
        {savedProfilesQuery.data?.length ? (
          <div className="mt-5 rounded-[24px] border border-white/80 bg-white/55 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className={labelClass}>Saved profiles</p>
                <p className="text-sm leading-6 text-[#65556c]">
                  Keep a shortlist of people you want to revisit before deciding.
                </p>
              </div>
              <span className="rounded-full border border-[#24162d]/10 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#24162d]">
                {savedProfilesQuery.data.length} saved
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {savedProfilesQuery.data.slice(0, 4).map((profile) => (
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
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-5 grid gap-4 rounded-[24px] border border-white/80 bg-white/55 p-4 md:grid-cols-4">
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

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {discoveryQuery.isLoading ? (
            <article className={cardClass}>
              <h3 className="font-serif text-2xl text-[#24162d]">Loading discovery feed...</h3>
              <p className="mt-3 text-base leading-7 text-[#65556c]">
                The frontend is calling the Fastify API through TanStack Query.
              </p>
            </article>
          ) : null}

          {discoveryQuery.isError ? (
            <article className={cardClass}>
              <h3 className="font-serif text-2xl text-[#24162d]">Discovery is not ready yet</h3>
              <p className="mt-3 text-base leading-7 text-[#65556c]">
                Sign in, complete onboarding, and make sure the API is running.
                Once profiles exist, discovery cards will appear here.
              </p>
            </article>
          ) : null}

          {discoveryQuery.data?.length === 0 ? (
            <article className={cardClass}>
              <h3 className="font-serif text-2xl text-[#24162d]">No profiles left right now</h3>
              <p className="mt-3 text-base leading-7 text-[#65556c]">
                Add another user profile from a second account, widen your filters, or finish onboarding if this account has not created a profile yet.
              </p>
              <Link
                className="mt-4 inline-flex w-fit items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
                to="/onboarding"
              >
                Go to onboarding
              </Link>
            </article>
          ) : null}

          {discoveryQuery.data?.map((profile) => (
            <article className={cardClass} key={profile.id}>
              <Avatar
                className="mb-4 h-48 w-full rounded-[24px] object-cover"
                label={profile.name}
                src={profile.photoUrl}
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-2xl text-[#24162d]">
                    {profile.name} in {profile.city}
                  </h3>
                  <p className="mt-2 text-sm uppercase tracking-[0.12em] text-[#db5b43]">
                    {profile.age} years old
                  </p>
                </div>
                {profile.verificationStatus === "verified" ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    Verified
                  </span>
                ) : profile.verificationStatus === "pending" ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-amber-700">
                    Pending
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-base leading-7 text-[#65556c]">{profile.bio}</p>
              <p className="mt-3 text-sm font-medium uppercase tracking-[0.12em] text-[#db5b43]">
                {profile.relationshipIntent.replaceAll("_", " ")}
              </p>
              <p className="mt-3 text-base leading-7 text-[#65556c]">{profile.prompt}</p>
              {profile.voiceIntroUrl ? (
                <div className="mt-4 rounded-[20px] border border-[#24162d]/10 bg-white/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#db5b43]">
                    Voice intro
                  </p>
                  <audio className="mt-2 w-full" controls preload="none" src={profile.voiceIntroUrl} />
                </div>
              ) : null}
              <p className="mt-4 text-sm font-medium tracking-[0.02em] text-[#db5b43]">
                {profile.tags.join(" / ")}
              </p>
              <div className="mt-4 rounded-[24px] border border-white/80 bg-white/55 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#db5b43]">
                  What stood out?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {reactionOptions.map((option) => (
                    <button
                      className={
                        getReactionDraft(profile.id).type === option.value
                          ? "rounded-full border border-[#24162d] bg-[#24162d] px-3 py-2 text-xs font-semibold text-white"
                          : "rounded-full border border-[#24162d]/10 bg-white/60 px-3 py-2 text-xs font-semibold text-[#24162d]"
                      }
                      key={option.value}
                      onClick={() =>
                        setReactionDrafts((current) => ({
                          ...current,
                          [profile.id]: {
                            type: option.value,
                            note: current[profile.id]?.note ?? ""
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
                      [profile.id]: {
                        type: current[profile.id]?.type ?? "profile",
                        note: event.target.value
                      }
                    }))
                  }
                  placeholder="Optional note that gets sent with your like."
                  type="text"
                  value={getReactionDraft(profile.id).note}
                />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-4 py-3 text-sm font-semibold text-[#24162d] transition hover:-translate-y-0.5"
                  onClick={() => {
                    passMutation.mutate(profile.id);
                    queryClient.setQueryData<DiscoveryProfile[]>(["discovery-feed"], (current) =>
                      (current ?? []).filter((entry) => entry.id !== profile.id)
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
                      targetUserId: profile.id,
                      saved: Boolean(profile.saved)
                    })
                  }
                  type="button"
                >
                  {profile.saved ? "Saved" : "Save"}
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-4 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
                  onClick={() =>
                    likeMutation.mutate({
                      targetUserId: profile.id,
                      reactionType: getReactionDraft(profile.id).type,
                      reactionNote: getReactionDraft(profile.id).note.trim() || undefined
                    })
                  }
                  type="button"
                >
                  {pendingLikeId === profile.id ? "Sending like..." : "Like"}
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#b53c27]/20 bg-[#fff1ed] px-4 py-3 text-sm font-semibold text-[#b53c27] transition hover:-translate-y-0.5"
                  onClick={() => blockMutation.mutate(profile.id)}
                  type="button"
                >
                  {pendingBlockId === profile.id ? "Blocking..." : "Block"}
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-4 py-3 text-sm font-semibold text-[#24162d] transition hover:-translate-y-0.5"
                  onClick={() =>
                    openReportModal({
                      userId: profile.id,
                      userName: profile.name
                    })
                  }
                  type="button"
                >
                  Report
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className={panelClass}>
        <p className={labelClass}>Matches</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
          Mutual likes show up here.
        </h2>
        <div className="mt-5 grid gap-4">
          {matchesQuery.data?.length ? (
            matchesQuery.data.map((match) => (
              <article
                className="rounded-[24px] border border-white/80 bg-[rgba(255,251,246,0.78)] p-5 shadow-[0_28px_70px_rgba(87,49,31,0.18)]"
                key={match.id}
              >
                <div className="flex items-center gap-4">
                  <Avatar
                    className="h-16 w-16 rounded-[20px] object-cover"
                    label={match.otherUserName}
                    src={match.otherUserPhotoUrl}
                  />
                  <div>
                    <h3 className="font-serif text-2xl text-[#24162d]">{match.otherUserName}</h3>
                    <p className="mt-2 text-base leading-7 text-[#65556c]">
                      Match created. Open the chat section below to send the first message.
                    </p>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="text-base leading-7 text-[#65556c]">
              No matches yet. Once two users like each other, the match will appear here.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className={panelClass}>
          <p className={labelClass}>Chats</p>
          <h2 className="font-serif text-[clamp(1.6rem,3vw,2.4rem)] leading-tight text-[#24162d]">
            Message your matches.
          </h2>
          <div className="mt-5 grid gap-4">
            {conversationsQuery.isLoading ? (
              <p className="text-base leading-7 text-[#65556c]">
                Loading conversations...
              </p>
            ) : null}

            {conversationsQuery.data?.items.length ? (
              conversationsQuery.data.items.map((conversation) => (
                <button
                  className={
                    selectedConversationId === conversation.id
                      ? "grid gap-2 rounded-[24px] border border-[#24162d] bg-white px-5 py-4 text-left shadow-[0_20px_55px_rgba(87,49,31,0.12)]"
                      : "grid gap-2 rounded-[24px] border border-[#24162d]/10 bg-white/60 px-5 py-4 text-left transition hover:-translate-y-0.5"
                  }
                  key={conversation.id}
                  onClick={() => setSelectedConversationId(conversation.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        className="h-14 w-14 rounded-[18px] object-cover"
                        label={conversation.otherUserName}
                        src={conversation.otherUserPhotoUrl}
                      />
                      <div>
                        <h3 className="font-serif text-xl text-[#24162d]">
                          {conversation.otherUserName}
                        </h3>
                      </div>
                      {conversation.lastMessageSenderUserId &&
                      conversation.unreadCount > 0 ? (
                        <span className="rounded-full bg-[#db5b43] px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-white">
                          {conversation.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs uppercase tracking-[0.12em] text-[#db5b43]">
                      {formatTimestamp(conversation.lastMessageAt ?? conversation.updatedAt)}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-[#65556c]">
                    {conversation.lastMessage
                      ? conversation.lastMessageSenderUserId === sessionQuery.data?.user.id
                        ? `You: ${conversation.lastMessage}`
                        : conversation.lastMessage
                      : "Say hi and get the conversation started."}
                  </p>
                </button>
              ))
            ) : (
              <p className="text-base leading-7 text-[#65556c]">
                No conversations yet. Create a mutual match first, then the chat will appear here.
              </p>
            )}
          </div>
        </section>

        <section className={panelClass}>
          <p className={labelClass}>Thread</p>
          <h2 className="font-serif text-[clamp(1.6rem,3vw,2.4rem)] leading-tight text-[#24162d]">
            {selectedConversation
              ? `Conversation with ${selectedConversation.otherUserName}`
              : "Choose a match to start chatting."}
          </h2>

          {selectedConversation ? (
            <>
              <div className="mt-5 flex items-center gap-4 rounded-[24px] border border-white/80 bg-white/55 p-4">
                <Avatar
                  className="h-16 w-16 rounded-[20px] object-cover"
                  label={selectedConversation.otherUserName}
                  src={selectedConversation.otherUserPhotoUrl}
                />
                <div>
                  <p className="font-serif text-2xl text-[#24162d]">
                    {selectedConversation.otherUserName}
                  </p>
                  <p className="text-sm leading-6 text-[#65556c]">
                    Keep the conversation warm, specific, and easy to reply to.
                  </p>
                </div>
                <div className="relative ml-auto" ref={conversationMenuRef}>
                  <button
                    aria-expanded={isConversationMenuOpen}
                    aria-haspopup="menu"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[#24162d]/10 bg-white/80 pb-1 text-[1.35rem] leading-none font-semibold text-[#24162d]"
                    onClick={() => setIsConversationMenuOpen((current) => !current)}
                    type="button"
                  >
                    <span aria-hidden="true" className="-translate-y-[1px]">
                      ...
                    </span>
                  </button>

                  {isConversationMenuOpen ? (
                    <div className="absolute right-0 top-14 z-20 grid min-w-44 gap-2 rounded-[20px] border border-white/80 bg-[#fff7ee] p-3 shadow-[0_20px_55px_rgba(87,49,31,0.18)]">
                      <button
                        className="rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-left text-sm font-semibold text-[#24162d]"
                        onClick={() => unmatchMutation.mutate(selectedConversation.otherUserId)}
                        type="button"
                      >
                        {unmatchMutation.isPending ? "Unmatching..." : "Unmatch"}
                      </button>
                      <button
                        className="rounded-2xl border border-[#b53c27]/20 bg-[#fff1ed] px-4 py-3 text-left text-sm font-semibold text-[#b53c27]"
                        onClick={() => blockMutation.mutate(selectedConversation.otherUserId)}
                        type="button"
                      >
                        {pendingBlockId === selectedConversation.otherUserId ? "Blocking..." : "Block"}
                      </button>
                      <button
                        className="rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-left text-sm font-semibold text-[#24162d]"
                        onClick={() =>
                          openReportModal({
                            userId: selectedConversation.otherUserId,
                            userName: selectedConversation.otherUserName
                          })
                        }
                        type="button"
                      >
                        Report
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid max-h-[28rem] gap-3 overflow-y-auto pr-2">
                {messagesQuery.isLoading ? (
                  <p className="text-base leading-7 text-[#65556c]">Loading messages...</p>
                ) : null}

                {messagesQuery.data?.length ? (
                  messagesQuery.data.map((message) => {
                    const isOwnMessage = message.senderUserId === sessionQuery.data?.user.id;

                    return (
                      <article
                        className={
                          isOwnMessage
                            ? "ml-auto max-w-[85%] rounded-[24px] rounded-br-md bg-[#24162d] px-4 py-3 text-white"
                            : "max-w-[85%] rounded-[24px] rounded-bl-md bg-white px-4 py-3 text-[#24162d]"
                        }
                        key={message.id}
                      >
                        <p className="text-sm leading-6">{message.content}</p>
                        <p
                          className={
                            isOwnMessage
                              ? "mt-2 text-xs uppercase tracking-[0.1em] text-white/70"
                              : "mt-2 text-xs uppercase tracking-[0.1em] text-[#db5b43]"
                          }
                        >
                          {formatTimestamp(message.createdAt)}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <p className="text-base leading-7 text-[#65556c]">
                    No messages yet. Send the first one and turn the match into a real conversation.
                  </p>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {starterPrompts.map((prompt) => (
                  <button
                    className="rounded-full border border-[#24162d]/10 bg-white/60 px-3 py-2 text-sm text-[#24162d] transition hover:-translate-y-0.5"
                    key={prompt}
                    onClick={() => setMessageInput(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <form
                className="mt-5 grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();

                  if (!selectedConversationId || !messageInput.trim()) {
                    return;
                  }

                  sendMessageMutation.mutate(selectedConversationId);
                }}
              >
                <textarea
                  className="min-h-28 w-full rounded-3xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none transition placeholder:text-[#65556c]/70 focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                  onChange={(event) => setMessageInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();

                      if (!selectedConversationId || !messageInput.trim()) {
                        return;
                      }

                      sendMessageMutation.mutate(selectedConversationId);
                    }
                  }}
                  placeholder="Send a thoughtful opener, not just 'hey'."
                  value={messageInput}
                />
                {sendMessageMutation.error instanceof ApiError ? (
                  <p className="text-sm text-[#b53c27]">
                    {sendMessageMutation.error.message}
                  </p>
                ) : null}
                <button
                  className="inline-flex w-fit items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
                  disabled={!messageInput.trim() || sendMessageMutation.isPending}
                  type="submit"
                >
                  {sendMessageMutation.isPending ? "Sending..." : "Send message"}
                </button>
              </form>
            </>
          ) : (
            <p className="mt-4 text-base leading-7 text-[#65556c]">
              Once you have a match, their conversation will appear here automatically.
            </p>
          )}
        </section>
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
