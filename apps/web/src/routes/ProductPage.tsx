import { Navigate } from "@tanstack/react-router";
import { useSessionProfile } from "../hooks/useSessionProfile";

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
function getPhaseStatusClass(status: string) {
  if (status === "Done") {
    return "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-emerald-700";
  }

  if (status === "In progress") {
    return "rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-amber-700";
  }

  return "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-600";
}

export function ProductPage() {
  const { sessionQuery, profileQuery, hasCompleteProfile } = useSessionProfile();

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
    </section>
  );
}
