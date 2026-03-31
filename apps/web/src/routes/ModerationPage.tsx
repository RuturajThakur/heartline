import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { useSessionProfile } from "../hooks/useSessionProfile";

type ReportItem = {
  id: string;
  reporterUserId: string;
  reporterName: string;
  targetUserId: string;
  targetUserName: string;
  reason: "spam" | "harassment" | "fake_profile" | "inappropriate_content" | "other";
  details: string | null;
  status: "open" | "reviewed" | "resolved";
  moderationNote: string | null;
  moderationReason?: string | null;
  suspensionEndsAt?: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  createdAt: string;
};

type ModerationUser = {
  id: string;
  email: string;
  name: string;
  city: string;
  role: string;
  status: string;
  created_at: string;
};

type UserHistory = {
  actions: Array<{
    id: string;
    action: string;
    reason: string | null;
    details: string | null;
    created_at: string;
    moderator_name: string;
  }>;
  reports: Array<{
    id: string;
    reason: string;
    details: string | null;
    status: string;
    created_at: string;
  }>;
};

type VerificationItem = {
  userId: string;
  name: string;
  email: string;
  city: string;
  photoUrl: string | null;
  voiceIntroUrl: string | null;
  verificationStatus: "pending" | "verified" | "unverified";
  requestedAt: string;
};

const panelClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.76)] p-7 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const labelClass = "mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]";

async function getReports() {
  return apiFetch<{ items: ReportItem[]; openCount: number }>("/api/reports");
}

export function ModerationPage() {
  const queryClient = useQueryClient();
  const { sessionQuery } = useSessionProfile();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedVerificationUserId, setSelectedVerificationUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<"open" | "reviewed" | "resolved">("reviewed");
  const [moderationNote, setModerationNote] = useState("");
  const [accountStatus, setAccountStatus] = useState<"active" | "suspended" | "banned">("active");
  const [verificationDecision, setVerificationDecision] = useState<"verified" | "rejected">(
    "verified"
  );

  const reportsQuery = useQuery({
    queryKey: ["reports"],
    queryFn: getReports,
    enabled: sessionQuery.isSuccess
  });
  const usersQuery = useQuery({
    queryKey: ["moderation-users", searchTerm],
    queryFn: () =>
      apiFetch<{ items: ModerationUser[] }>(`/api/moderation/users?q=${encodeURIComponent(searchTerm)}`),
    enabled: sessionQuery.isSuccess
  });
  const historyQuery = useQuery({
    queryKey: ["moderation-user-history", selectedUserId],
    queryFn: () => apiFetch<UserHistory>(`/api/moderation/users/${selectedUserId}/history`),
    enabled: sessionQuery.isSuccess && Boolean(selectedUserId)
  });
  const verificationsQuery = useQuery({
    queryKey: ["verification-queue"],
    queryFn: () =>
      apiFetch<{ items: VerificationItem[]; pendingCount: number }>("/api/verifications"),
    enabled: sessionQuery.isSuccess
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>(`/api/reports/${selectedReportId}/review`, {
        method: "POST",
        body: JSON.stringify({
          status,
          moderationNote
        })
      }),
    onSuccess: async () => {
      setSelectedReportId(null);
      setModerationNote("");
      setStatus("reviewed");
      await queryClient.invalidateQueries({
        queryKey: ["reports"]
      });
    }
  });
  const accountStatusMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ ok: boolean }>(`/api/users/${userId}/status`, {
        method: "POST",
        body: JSON.stringify({
          status: accountStatus
        })
      })
  });
  const verificationReviewMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>(`/api/verifications/${selectedVerificationUserId}/review`, {
        method: "POST",
        body: JSON.stringify({
          decision: verificationDecision,
          moderationNote
        })
      }),
    onSuccess: async () => {
      setSelectedVerificationUserId(null);
      setVerificationDecision("verified");
      setModerationNote("");
      await queryClient.invalidateQueries({
        queryKey: ["verification-queue"]
      });
    }
  });

  if (sessionQuery.isError) {
    return <Navigate to="/" />;
  }

  if (sessionQuery.data?.user.role !== "admin") {
    return <Navigate to="/product" />;
  }

  if (sessionQuery.isLoading || sessionQuery.isPending) {
    return (
      <section className={panelClass}>
        <p className={labelClass}>Moderation</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] text-[#24162d]">
          Loading moderation tools.
        </h2>
      </section>
    );
  }

  const selectedReport =
    reportsQuery.data?.items.find((report) => report.id === selectedReportId) ?? null;
  const selectedVerification =
    verificationsQuery.data?.items.find((item) => item.userId === selectedVerificationUserId) ?? null;

  return (
    <section className="grid gap-6">
      <div className={panelClass}>
        <p className={labelClass}>Moderation</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
          Review trust and safety reports.
        </h2>
        <p className="mt-4 text-base leading-7 text-[#65556c]">
          This is a lightweight internal dashboard for triaging reports, adding notes,
          and marking them reviewed or resolved.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className={panelClass}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className={labelClass}>Verification</p>
              <h3 className="font-serif text-2xl text-[#24162d]">Pending requests</h3>
            </div>
            <span className="rounded-full bg-[#db5b43] px-3 py-2 text-sm font-semibold text-white">
              {verificationsQuery.data?.pendingCount ?? 0} pending
            </span>
          </div>

          <div className="mt-5 grid gap-4">
            {verificationsQuery.data?.items.length ? (
              verificationsQuery.data.items.map((item) => (
                <button
                  className={
                    selectedVerificationUserId === item.userId
                      ? "grid gap-2 rounded-[24px] border border-[#24162d] bg-white px-5 py-4 text-left shadow-[0_20px_55px_rgba(87,49,31,0.12)]"
                      : "grid gap-2 rounded-[24px] border border-[#24162d]/10 bg-white/60 px-5 py-4 text-left transition hover:-translate-y-0.5"
                  }
                  key={item.userId}
                  onClick={() => {
                    setSelectedVerificationUserId(item.userId);
                    setVerificationDecision("verified");
                    setModerationNote("");
                  }}
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    {item.photoUrl ? (
                      <img
                        alt={item.name}
                        className="h-16 w-16 rounded-[18px] object-cover"
                        src={item.photoUrl}
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#db5b43]/14 font-semibold uppercase text-[#db5b43]">
                        {item.name.slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-[#24162d]">{item.name}</p>
                      <p className="text-sm text-[#65556c]">{item.email}</p>
                      <p className="text-xs uppercase tracking-[0.12em] text-[#db5b43]">
                        {item.city}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-base leading-7 text-[#65556c]">
                No pending verification requests right now.
              </p>
            )}
          </div>
        </section>

        <section className={panelClass}>
          <p className={labelClass}>Verification review</p>
          <h3 className="font-serif text-2xl text-[#24162d]">
            {selectedVerification ? `Review ${selectedVerification.name}` : "Choose a request"}
          </h3>

          {selectedVerification ? (
            <form
              className="mt-5 grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                verificationReviewMutation.mutate();
              }}
            >
              <div className="rounded-[24px] border border-white/80 bg-white/55 p-4">
                {selectedVerification.photoUrl ? (
                  <img
                    alt={selectedVerification.name}
                    className="h-56 w-full rounded-[24px] object-cover"
                    src={selectedVerification.photoUrl}
                  />
                ) : null}
                <p className="mt-3 text-base leading-7 text-[#65556c]">
                  Requested on {new Date(selectedVerification.requestedAt).toLocaleString()}
                </p>
                {selectedVerification.voiceIntroUrl ? (
                  <audio
                    className="mt-3 w-full"
                    controls
                    preload="none"
                    src={selectedVerification.voiceIntroUrl}
                  />
                ) : null}
              </div>

              <label className="grid gap-2 text-sm text-[#65556c]">
                <span>Decision</span>
                <select
                  className="rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                  onChange={(event) =>
                    setVerificationDecision(event.target.value as "verified" | "rejected")
                  }
                  value={verificationDecision}
                >
                  <option value="verified">Approve verification</option>
                  <option value="rejected">Reject verification</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm text-[#65556c]">
                <span>Moderator note</span>
                <textarea
                  className="min-h-32 rounded-3xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none transition placeholder:text-[#65556c]/70 focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                  onChange={(event) => setModerationNote(event.target.value)}
                  placeholder="Explain the reason if you reject, or leave a quick internal note."
                  value={moderationNote}
                />
              </label>

              {verificationReviewMutation.error instanceof ApiError ? (
                <p className="text-sm text-[#b53c27]">
                  {verificationReviewMutation.error.message}
                </p>
              ) : null}

              <button
                className="inline-flex w-fit items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
                type="submit"
              >
                {verificationReviewMutation.isPending ? "Saving..." : "Save verification review"}
              </button>
            </form>
          ) : (
            <p className="mt-4 text-base leading-7 text-[#65556c]">
              Pick a pending request to approve or reject verification.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className={panelClass}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className={labelClass}>Queue</p>
              <h3 className="font-serif text-2xl text-[#24162d]">Incoming reports</h3>
            </div>
            <span className="rounded-full bg-[#db5b43] px-3 py-2 text-sm font-semibold text-white">
              {reportsQuery.data?.openCount ?? 0} open
            </span>
          </div>

          <div className="mt-5 grid gap-4">
            {reportsQuery.data?.items.length ? (
              reportsQuery.data.items.map((report) => (
                <button
                  className={
                    selectedReportId === report.id
                      ? "grid gap-2 rounded-[24px] border border-[#24162d] bg-white px-5 py-4 text-left shadow-[0_20px_55px_rgba(87,49,31,0.12)]"
                      : "grid gap-2 rounded-[24px] border border-[#24162d]/10 bg-white/60 px-5 py-4 text-left transition hover:-translate-y-0.5"
                  }
                  key={report.id}
                  onClick={() => {
                    setSelectedReportId(report.id);
                    setStatus(report.status);
                    setModerationNote(report.moderationNote ?? "");
                    setAccountStatus("active");
                  }}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-serif text-xl text-[#24162d]">
                      {report.targetUserName}
                    </h4>
                    <span
                      className={
                        report.status === "open"
                          ? "rounded-full bg-[#db5b43] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white"
                          : "rounded-full bg-[#24162d]/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#24162d]"
                      }
                    >
                      {report.status}
                    </span>
                  </div>
                  <p className="text-sm uppercase tracking-[0.12em] text-[#db5b43]">
                    {report.reason.replaceAll("_", " ")}
                  </p>
                  <p className="text-sm leading-6 text-[#65556c]">
                    Reported by {report.reporterName}
                  </p>
                  <p className="text-sm leading-6 text-[#65556c]">
                    {report.details || "No extra details provided."}
                  </p>
                </button>
              ))
            ) : (
              <p className="text-base leading-7 text-[#65556c]">
                No reports yet. Safety reports will appear here once users start flagging profiles.
              </p>
            )}
          </div>
        </section>

        <section className={panelClass}>
          <p className={labelClass}>Review</p>
          <h3 className="font-serif text-2xl text-[#24162d]">
            {selectedReport ? `Review ${selectedReport.targetUserName}` : "Choose a report"}
          </h3>

          {selectedReport ? (
            <form
              className="mt-5 grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                reviewMutation.mutate();
              }}
            >
              <div className="rounded-[24px] border border-white/80 bg-white/55 p-4">
                <p className="text-sm uppercase tracking-[0.12em] text-[#db5b43]">
                  {selectedReport.reason.replaceAll("_", " ")}
                </p>
                <p className="mt-2 text-base leading-7 text-[#65556c]">
                  Reported by {selectedReport.reporterName}
                </p>
                <p className="mt-2 text-base leading-7 text-[#65556c]">
                  {selectedReport.details || "No extra details provided."}
                </p>
                {selectedReport.reviewedAt ? (
                  <p className="mt-3 text-sm text-[#65556c]">
                    Last reviewed by {selectedReport.reviewedByName ?? "a moderator"} on{" "}
                    {new Date(selectedReport.reviewedAt).toLocaleString()}
                  </p>
                ) : null}
              </div>

              <label className="grid gap-2 text-sm text-[#65556c]">
                <span>Status</span>
                <select
                  className="rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                  onChange={(event) =>
                    setStatus(event.target.value as "open" | "reviewed" | "resolved")
                  }
                  value={status}
                >
                  <option value="open">Open</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="resolved">Resolved</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm text-[#65556c]">
                <span>Moderator note</span>
                <textarea
                  className="min-h-32 rounded-3xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none transition placeholder:text-[#65556c]/70 focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                  onChange={(event) => setModerationNote(event.target.value)}
                  placeholder="Record what was reviewed and any action taken."
                  value={moderationNote}
                />
              </label>

              <label className="grid gap-2 text-sm text-[#65556c]">
                <span>Account status action</span>
                <select
                  className="rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                  onChange={(event) =>
                    setAccountStatus(
                      event.target.value as "active" | "suspended" | "banned"
                    )
                  }
                  value={accountStatus}
                >
                  <option value="active">Keep active</option>
                  <option value="suspended">Suspend account</option>
                  <option value="banned">Ban account</option>
                </select>
              </label>

              {reviewMutation.error instanceof ApiError ? (
                <p className="text-sm text-[#b53c27]">{reviewMutation.error.message}</p>
              ) : null}
              {accountStatusMutation.error instanceof ApiError ? (
                <p className="text-sm text-[#b53c27]">{accountStatusMutation.error.message}</p>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
                  type="submit"
                >
                  {reviewMutation.isPending ? "Saving..." : "Save review"}
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#b53c27]/20 bg-[#fff1ed] px-5 py-3 text-sm font-semibold text-[#b53c27]"
                  onClick={() => {
                    if (!selectedReport) {
                      return;
                    }

                    accountStatusMutation.mutate(selectedReport.targetUserId);
                  }}
                  type="button"
                >
                  {accountStatusMutation.isPending ? "Updating..." : "Apply account action"}
                </button>
                <Link
                  className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-5 py-3 text-sm font-semibold text-[#24162d]"
                  to="/product"
                >
                  Back to product
                </Link>
              </div>
            </form>
          ) : (
            <p className="mt-4 text-base leading-7 text-[#65556c]">
              Pick a report from the queue to review it, add a note, and update its status.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className={panelClass}>
          <p className={labelClass}>User search</p>
          <h3 className="font-serif text-2xl text-[#24162d]">Find accounts</h3>
          <input
            className="mt-4 w-full rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by name or email"
            type="text"
            value={searchTerm}
          />
          <div className="mt-4 grid gap-3">
            {usersQuery.data?.items.map((user) => (
              <button
                className={
                  selectedUserId === user.id
                    ? "rounded-[20px] border border-[#24162d] bg-white px-4 py-3 text-left"
                    : "rounded-[20px] border border-[#24162d]/10 bg-white/60 px-4 py-3 text-left"
                }
                key={user.id}
                onClick={() => setSelectedUserId(user.id)}
                type="button"
              >
                <p className="font-semibold text-[#24162d]">{user.name}</p>
                <p className="text-sm text-[#65556c]">{user.email}</p>
                <p className="text-xs uppercase tracking-[0.12em] text-[#db5b43]">
                  {user.status} / {user.role}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className={panelClass}>
          <p className={labelClass}>User history</p>
          <h3 className="font-serif text-2xl text-[#24162d]">
            {selectedUserId ? "Moderation timeline" : "Choose a user"}
          </h3>
          {selectedUserId ? (
            <div className="mt-4 grid gap-4">
              {historyQuery.data?.actions.map((action) => (
                <article
                  className="rounded-[20px] border border-white/80 bg-white/60 p-4"
                  key={action.id}
                >
                  <p className="text-sm uppercase tracking-[0.12em] text-[#db5b43]">
                    {action.action}
                  </p>
                  <p className="mt-2 text-sm text-[#65556c]">
                    By {action.moderator_name} on {new Date(action.created_at).toLocaleString()}
                  </p>
                  <p className="mt-2 text-sm text-[#65556c]">{action.reason || action.details || "No reason recorded."}</p>
                </article>
              ))}
              {historyQuery.data?.reports.map((report) => (
                <article
                  className="rounded-[20px] border border-white/80 bg-white/60 p-4"
                  key={report.id}
                >
                  <p className="text-sm uppercase tracking-[0.12em] text-[#db5b43]">
                    report / {report.status}
                  </p>
                  <p className="mt-2 text-sm text-[#65556c]">
                    {report.reason.replaceAll("_", " ")}
                  </p>
                  <p className="mt-2 text-sm text-[#65556c]">
                    {report.details || "No extra details provided."}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-base leading-7 text-[#65556c]">
              Search for a user to review their moderation history and reports.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
