import { type PropsWithChildren, useEffect, useMemo, useState } from "react";

export type ProfileShowcasePrompt = {
  question: string;
  answer: string;
};

export function ProfileShowcase({
  name,
  city,
  relationshipIntent,
  verificationStatus,
  photoUrls,
  voiceIntroUrl,
  bio,
  prompts,
  interests,
  headerLabel,
  emptyBioText,
  promptFallbackText,
  interestEmptyText,
  children
}: PropsWithChildren<{
  name: string;
  city: string;
  relationshipIntent: string;
  verificationStatus?: "unverified" | "pending" | "verified";
  photoUrls: string[];
  voiceIntroUrl?: string | null;
  bio: string;
  prompts: ProfileShowcasePrompt[];
  interests: string[];
  headerLabel: string;
  emptyBioText: string;
  promptFallbackText: string;
  interestEmptyText: string;
}>) {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  const normalizedPhotoUrls = useMemo(() => photoUrls.filter(Boolean), [photoUrls]);

  useEffect(() => {
    setActivePhotoIndex(0);
  }, [normalizedPhotoUrls]);

  const activePhotoUrl =
    normalizedPhotoUrls[Math.min(activePhotoIndex, Math.max(normalizedPhotoUrls.length - 1, 0))] ??
    null;

  return (
    <div className="overflow-hidden rounded-[32px] bg-white">
      <div className="relative">
        {activePhotoUrl ? (
          <img
            alt={`${name} profile`}
            className="aspect-[3/4] w-full object-cover"
            src={activePhotoUrl}
          />
        ) : (
          <div className="aspect-[3/4] w-full bg-[#24162d]/8" />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#120b14]/82 via-[#120b14]/38 to-transparent px-6 pb-6 pt-20 text-white">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[0.72rem] uppercase tracking-[0.16em] text-white/70">
                {headerLabel}
              </p>
              <h3 className="mt-2 font-serif text-[clamp(1.8rem,4vw,2.8rem)] leading-[0.95]">
                {name}
              </h3>
              <p className="mt-2 text-sm uppercase tracking-[0.14em] text-white/78">
                {city} | {relationshipIntent.replaceAll("_", " ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {verificationStatus === "verified" ? (
                <span className="rounded-full bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#1a6b52]">
                  Verified
                </span>
              ) : verificationStatus === "pending" ? (
                <span className="rounded-full bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#9a6400]">
                  Pending
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {normalizedPhotoUrls.length > 1 ? (
        <div className="border-t border-[#24162d]/8 bg-[#fffaf4] px-4 py-4">
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            {normalizedPhotoUrls.map((photoUrl, index) => (
              <button
                className={
                  index === activePhotoIndex
                    ? "overflow-hidden rounded-[18px] border-2 border-[#24162d] bg-white shadow-[0_10px_30px_rgba(87,49,31,0.12)]"
                    : "overflow-hidden rounded-[18px] border border-[#24162d]/10 bg-white/70"
                }
                key={`${photoUrl}-${index}`}
                onClick={() => setActivePhotoIndex(index)}
                type="button"
              >
                <img
                  alt={`${name} photo ${index + 1}`}
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
          <p className="mt-3 text-lg leading-8 text-[#4b3b4f]">{bio || emptyBioText}</p>
        </section>

        <div className="grid gap-4">
          {prompts.map((prompt, index) => (
            <article
              className="rounded-3xl border border-white/80 bg-[rgba(255,251,246,0.78)] p-5"
              key={`${index}-${prompt.question}`}
            >
              {prompt.question ? (
                <p className="text-sm font-semibold text-[#db5b43]">{prompt.question}</p>
              ) : null}
              <p className="mt-2 text-base leading-7 text-[#65556c]">
                {prompt.answer || promptFallbackText}
              </p>
            </article>
          ))}
        </div>

        {voiceIntroUrl ? (
          <section className="rounded-[28px] bg-[#fffaf4] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#db5b43]">
              Voice intro
            </p>
            <audio className="mt-3 w-full" controls preload="none" src={voiceIntroUrl} />
          </section>
        ) : null}

        <section className="rounded-[28px] bg-[#fffaf4] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#db5b43]">
            Interests
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {interests.length > 0 ? (
              interests.map((interest) => (
                <span
                  className="rounded-full border border-[#24162d]/10 bg-white px-3 py-2 text-sm font-medium text-[#24162d]"
                  key={interest}
                >
                  {interest}
                </span>
              ))
            ) : (
              <span className="text-sm text-[#65556c]">{interestEmptyText}</span>
            )}
          </div>
        </section>

        {children ? <div className="grid gap-4">{children}</div> : null}
      </div>
    </div>
  );
}
