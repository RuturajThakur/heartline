import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { Cropper, type ReactCropperElement } from "react-cropper";
import "cropperjs/dist/cropper.css";
import {
  defaultProfileForm,
  genderOptions,
  getProfileCompletion,
  isProfileComplete,
  promptQuestions,
  interestedInOptions,
  normalizeProfilePayload,
  type ProfilePayload,
  type SessionUser
} from "../lib/profile";

const panelClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.76)] p-7 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const fieldClass =
  "w-full rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none transition placeholder:text-[#65556c]/70 focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15";
const labelClass = "mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]";

export function ProfileEditorPage({
  mode
}: {
  mode: "onboarding" | "edit";
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [voiceIntroError, setVoiceIntroError] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState("profile-photo.jpg");
  const cropperRef = useRef<ReactCropperElement | null>(null);
  const bioRef = useRef<HTMLTextAreaElement | null>(null);
  const promptRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const [form, setForm] = useState<ProfilePayload>(defaultProfileForm);
  const [interestInput, setInterestInput] = useState("");
  const [draggedPhotoUrl, setDraggedPhotoUrl] = useState<string | null>(null);

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

  useEffect(() => {
    if (profileQuery.data) {
      const normalized = normalizeProfilePayload(profileQuery.data);
      setForm({
        ...normalized,
        prompts:
          Array.isArray(normalized.prompts) && normalized.prompts.length > 0
            ? normalized.prompts
            : defaultProfileForm.prompts
      });
    }
  }, [profileQuery.data]);

  const completion = getProfileCompletion(form);

  const saveProfileMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ profile: ProfilePayload }>("/api/profile", {
        method: "PUT",
        body: JSON.stringify(form)
      }),
    onSuccess: async (result) => {
      setFieldErrors({});
      queryClient.setQueryData(["dating-profile"], normalizeProfilePayload(result.profile));
      await queryClient.invalidateQueries({
        queryKey: ["dating-profile"]
      });
      navigate({
        to: mode === "onboarding" ? "/product" : "/settings"
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.field) {
        setFieldErrors({
          [error.field]: error.message
        });

        if (error.field === "bio") {
          bioRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
          bioRef.current?.focus();
          return;
        }

        const promptMatch = error.field.match(/^prompts\.(\d+)\.answer$/);

        if (promptMatch) {
          const index = Number(promptMatch[1]);
          const target = promptRefs.current[index];

          target?.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
          target?.focus();
        }
      }
    }
  });
  const uploadPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      const payload = new FormData();
      payload.append("photo", file);
      return apiFetch<{ photoUrl: string; photoUrls: string[] }>("/api/profile/photo", {
        method: "POST",
        body: payload
      });
    },
    onSuccess: async (result) => {
      setPhotoError(null);
      setForm((current) => ({
        ...current,
        photoUrl: result.photoUrl,
        photoUrls: result.photoUrls
      }));
      queryClient.setQueryData<ProfilePayload | null>(["dating-profile"], (current) =>
        current
          ? {
              ...normalizeProfilePayload(current),
              photoUrl: result.photoUrl,
              photoUrls: result.photoUrls
            }
          : current
      );
      await queryClient.invalidateQueries({
        queryKey: ["dating-profile"]
      });
    },
    onError: (error) => {
      setPhotoError(error instanceof ApiError ? error.message : "Could not upload photo.");
    }
  });
  const setPrimaryPhotoMutation = useMutation({
    mutationFn: (photoUrl: string) =>
      apiFetch<{ ok: boolean }>(
        `/api/profile/photos/${photoUrl.split("/").pop()?.split(".")[0]}/primary`,
        {
          method: "POST"
        }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["dating-profile"]
      });
      await profileQuery.refetch();
    }
  });
  const removePhotoMutation = useMutation({
    mutationFn: (photoUrl: string) =>
      apiFetch<{ ok: boolean }>(
        `/api/profile/photos/${photoUrl.split("/").pop()?.split(".")[0]}/remove`,
        {
          method: "POST"
        }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["dating-profile"]
      });
      await profileQuery.refetch();
    }
  });
  const reorderPhotosMutation = useMutation({
    mutationFn: (photoUrls: string[]) =>
      apiFetch<{ ok: boolean }>("/api/profile/photos/reorder", {
        method: "POST",
        body: JSON.stringify({
          photoUrls
        })
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["dating-profile"]
      });
      await profileQuery.refetch();
    }
  });
  const uploadVoiceIntroMutation = useMutation({
    mutationFn: async (file: File) => {
      const payload = new FormData();
      payload.append("voiceIntro", file);
      return apiFetch<{ voiceIntroUrl: string }>("/api/profile/voice-intro", {
        method: "POST",
        body: payload
      });
    },
    onSuccess: async (result) => {
      setVoiceIntroError(null);
      setForm((current) => ({
        ...current,
        voiceIntroUrl: result.voiceIntroUrl
      }));
      queryClient.setQueryData<ProfilePayload | null>(["dating-profile"], (current) =>
        current
          ? {
              ...normalizeProfilePayload(current),
              voiceIntroUrl: result.voiceIntroUrl
            }
          : current
      );
      await queryClient.invalidateQueries({
        queryKey: ["dating-profile"]
      });
    },
    onError: (error) => {
      setVoiceIntroError(
        error instanceof ApiError ? error.message : "Could not upload voice intro."
      );
    }
  });
  const requestVerificationMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ profile: ProfilePayload | null }>("/api/profile/verification/request", {
        method: "POST"
      }),
    onSuccess: async (result) => {
      if (result.profile) {
        const normalized = normalizeProfilePayload(result.profile);
        setForm(normalized);
        queryClient.setQueryData(["dating-profile"], normalized);
      }
      await queryClient.invalidateQueries({
        queryKey: ["dating-profile"]
      });
    }
  });

  function closeCropModal() {
    if (cropImageSrc) {
      URL.revokeObjectURL(cropImageSrc);
    }

    setCropImageSrc(null);
    setCropFileName("profile-photo.jpg");
  }

  async function confirmCrop() {
    const cropper = cropperRef.current?.cropper;

    if (!cropImageSrc || !cropper) {
      setPhotoError("Choose and crop a photo first.");
      return;
    }

    try {
      const canvas = cropper.getCroppedCanvas({
        width: 960,
        height: 1200,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high"
      });

      if (!canvas) {
        throw new Error("Could not prepare cropped image.");
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.92);
      });

      if (!blob) {
        throw new Error("Could not export cropped image.");
      }

      const croppedFile = new File(
        [blob],
        `${cropFileName.replace(/\.[^.]+$/, "")}-cropped.jpg`,
        {
          type: "image/jpeg"
        }
      );

      uploadPhotoMutation.mutate(croppedFile, {
        onSuccess: async (result) => {
          setPhotoError(null);
          setForm((current) => ({
            ...current,
            photoUrl: result.photoUrl,
            photoUrls: result.photoUrls
          }));
          queryClient.setQueryData<ProfilePayload | null>(["dating-profile"], (current) =>
            current
              ? {
                  ...normalizeProfilePayload(current),
                  photoUrl: result.photoUrl,
                  photoUrls: result.photoUrls
                }
              : current
          );
          await queryClient.invalidateQueries({
            queryKey: ["dating-profile"]
          });
          closeCropModal();
        }
      });
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Could not crop photo.");
    }
  }

  function updatePrompt(index: number, answer: string) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[`prompts.${index}.answer`];
      return next;
    });

    setForm((current) => ({
      ...current,
      prompts: current.prompts.map((prompt, currentIndex) =>
        currentIndex === index ? { ...prompt, answer } : prompt
      )
    }));
  }

  function updatePromptQuestion(index: number, question: string) {
    setForm((current) => ({
      ...current,
      prompts: current.prompts.map((prompt, currentIndex) =>
        currentIndex === index ? { ...prompt, question } : prompt
      )
    }));
  }

  function reorderPhotoGallery(sourcePhotoUrl: string, targetPhotoUrl: string) {
    if (sourcePhotoUrl === targetPhotoUrl) {
      return;
    }

    const currentPhotoUrls = [...(form.photoUrls ?? [])];
    const sourceIndex = currentPhotoUrls.indexOf(sourcePhotoUrl);
    const targetIndex = currentPhotoUrls.indexOf(targetPhotoUrl);

    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }

    const [photo] = currentPhotoUrls.splice(sourceIndex, 1);
    currentPhotoUrls.splice(targetIndex, 0, photo);
    setForm((current) => ({
      ...current,
      photoUrl: currentPhotoUrls[0] ?? null,
      photoUrls: currentPhotoUrls
    }));
    reorderPhotosMutation.mutate(currentPhotoUrls);
  }

  function addInterest() {
    const value = interestInput.trim();

    if (!value || form.interests.includes(value) || form.interests.length >= 8) {
      return;
    }

    setForm((current) => ({
      ...current,
      interests: [...current.interests, value]
    }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.interests;
      return next;
    });
    setInterestInput("");
  }

  function toggleInterestedIn(
    value: "men" | "women" | "all"
  ) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.interestedIn;
      return next;
    });

    setForm((current) => ({
      ...current,
      interestedIn: current.interestedIn.includes(value)
        ? current.interestedIn.filter((entry) => entry !== value)
        : [...current.interestedIn, value]
    }));
  }

  if (sessionQuery.isError) {
    return (
      <section className={panelClass}>
        <p className={labelClass}>Onboarding</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
          Sign in first to build your dating profile.
        </h2>
        <p className="mt-4 max-w-[56ch] text-base leading-7 text-[#65556c]">
          The MVP flow starts with account creation on the home screen. Once you are
          signed in, come back here to complete your profile.
        </p>
        <Link
          className="mt-6 inline-flex w-fit items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
          to="/"
        >
          Go to home
        </Link>
      </section>
    );
  }

  if (
    mode === "onboarding" &&
    profileQuery.isSuccess &&
    profileQuery.data &&
    isProfileComplete(profileQuery.data)
  ) {
    return <Navigate to="/edit-profile" />;
  }

  return (
    <section className="grid gap-6">
      <div className={panelClass}>
        <p className={labelClass}>{mode === "onboarding" ? "Onboarding" : "Edit profile"}</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
          {mode === "onboarding"
            ? "Build the profile people actually react to."
            : "Update the profile people already see."}
        </h2>
        <p className="mt-4 max-w-[62ch] text-base leading-7 text-[#65556c]">
          {mode === "onboarding"
            ? "This is the first real MVP flow: capture intent, identity, prompts, and interests so discovery can feel personal instead of random."
            : "This is your ongoing profile editor. Use it to keep photos, prompts, bio, and interests fresh without going back through onboarding."}
        </p>
        <div className="mt-5 rounded-[24px] border border-white/80 bg-white/55 p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#db5b43]">
              Profile completion
            </p>
            <p className="text-sm font-semibold text-[#24162d]">{completion.percent}%</p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#24162d]/10">
            <div
              className="h-full rounded-full bg-[#db5b43]"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          {completion.missing.length ? (
            <p className="mt-3 text-sm leading-6 text-[#65556c]">
              Still missing: {completion.missing.join(", ")}
            </p>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[#65556c]">
              Your profile is fully ready for discovery.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <form
          className={`${panelClass} grid gap-6`}
          onSubmit={(event) => {
            event.preventDefault();
            saveProfileMutation.mutate();
          }}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid gap-3 md:col-span-2">
              <span className="text-sm font-semibold text-[#24162d]">Profile photos</span>
              <div className="flex flex-col gap-4 rounded-[24px] border border-white/80 bg-white/55 p-4 sm:flex-row sm:items-center">
                {form.photoUrl ? (
                  <img
                    alt="Profile preview"
                    className="h-28 w-28 rounded-[24px] object-cover"
                    src={form.photoUrl}
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-[24px] bg-[#24162d]/8 text-center text-sm text-[#65556c]">
                    Add your first photo
                  </div>
                )}
                <div className="grid gap-2">
                  <label className="inline-flex w-fit cursor-pointer items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-4 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5">
                    <span>
                      {uploadPhotoMutation.isPending
                        ? "Uploading..."
                        : form.photoUrls && form.photoUrls.length > 0
                          ? "Add another photo"
                          : "Choose photo"}
                    </span>
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      disabled={(form.photoUrls?.length ?? 0) >= 6}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];

                        if (!file) {
                          return;
                        }

                        setPhotoError(null);
                        setCropFileName(file.name);
                        setCropImageSrc(URL.createObjectURL(file));
                        event.target.value = "";
                      }}
                      type="file"
                    />
                  </label>
                  <p className="text-sm text-[#65556c]">
                    PNG, JPG, or WebP up to 5MB. {(form.photoUrls?.length ?? 0)}/6 photos added.
                    Drag images to reorder them and your first image stays primary.
                  </p>
                  {photoError ? (
                    <p className="text-sm text-[#b53c27]">{photoError}</p>
                  ) : null}
                </div>
              </div>
              {form.photoUrls?.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {form.photoUrls.map((photoUrl) => (
                    <div
                      className={`group relative rounded-[24px] border border-white/80 bg-white/60 p-3 transition ${
                        draggedPhotoUrl === photoUrl ? "scale-[0.98] opacity-70" : ""
                      }`}
                      draggable
                      key={photoUrl}
                      onDragOver={(event) => {
                        event.preventDefault();
                      }}
                      onDragStart={() => {
                        setDraggedPhotoUrl(photoUrl);
                      }}
                      onDrop={() => {
                        if (draggedPhotoUrl) {
                          reorderPhotoGallery(draggedPhotoUrl, photoUrl);
                        }
                        setDraggedPhotoUrl(null);
                      }}
                      onDragEnd={() => {
                        setDraggedPhotoUrl(null);
                      }}
                    >
                      <button
                        aria-label="Remove photo"
                        className="absolute right-5 top-5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#24162d]/78 text-lg font-semibold text-white opacity-0 shadow-sm transition group-hover:opacity-100"
                        onClick={() => removePhotoMutation.mutate(photoUrl)}
                        title="Remove"
                        type="button"
                      >
                        x
                      </button>
                      <img
                        alt="Profile gallery preview"
                        className="h-40 w-full rounded-[20px] object-cover"
                        src={photoUrl}
                      />
                      <div className="mt-3 flex items-center justify-between gap-3">
                        {photoUrl !== form.photoUrl ? (
                          <button
                            className="rounded-full border border-[#24162d]/10 bg-white/60 px-3 py-2 text-xs font-semibold text-[#24162d]"
                            onClick={() => setPrimaryPhotoMutation.mutate(photoUrl)}
                            type="button"
                          >
                            Make primary
                          </button>
                        ) : (
                          <span className="rounded-full bg-[#db5b43] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                            Primary
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {(form.photoUrls?.length ?? 0) < 6 ? (
                    <label className="flex h-full min-h-56 cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-[#24162d]/20 bg-white/35 p-5 text-center transition hover:-translate-y-0.5 hover:border-[#db5b43]/50 hover:bg-white/55">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#24162d] text-2xl text-white">
                        +
                      </span>
                      <span className="mt-4 text-sm font-semibold text-[#24162d]">
                        Add another photo
                      </span>
                      <span className="mt-2 text-sm leading-6 text-[#65556c]">
                        You can add {6 - (form.photoUrls?.length ?? 0)} more.
                      </span>
                      <input
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];

                          if (!file) {
                            return;
                          }

                          setPhotoError(null);
                          setCropFileName(file.name);
                          setCropImageSrc(URL.createObjectURL(file));
                          event.target.value = "";
                        }}
                        type="file"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:col-span-2">
              <span className="text-sm font-semibold text-[#24162d]">Voice intro</span>
              <div className="rounded-[24px] border border-white/80 bg-white/55 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-[#65556c]">
                      Add a short voice intro so discovery feels more human than just photos and text.
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#db5b43]">
                      Audio up to 12MB
                    </p>
                  </div>
                  <label className="inline-flex w-fit cursor-pointer items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-4 py-3 text-sm font-semibold text-white">
                    <span>
                      {uploadVoiceIntroMutation.isPending ? "Uploading..." : "Choose audio"}
                    </span>
                    <input
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/webm,audio/ogg"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];

                        if (!file) {
                          return;
                        }

                        setVoiceIntroError(null);
                        uploadVoiceIntroMutation.mutate(file);
                        event.target.value = "";
                      }}
                      type="file"
                    />
                  </label>
                </div>
                {form.voiceIntroUrl ? (
                  <audio className="mt-4 w-full" controls preload="none" src={form.voiceIntroUrl} />
                ) : null}
                {voiceIntroError ? (
                  <p className="mt-3 text-sm text-[#b53c27]">{voiceIntroError}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 md:col-span-2">
              <span className="text-sm font-semibold text-[#24162d]">Verification</span>
              <div className="rounded-[24px] border border-white/80 bg-white/55 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-[#65556c]">
                      Request a verification badge once your primary photo is in place.
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#db5b43]">
                      Status: {form.verificationStatus ?? "unverified"}
                    </p>
                  </div>
                  <button
                    className="inline-flex w-fit items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      requestVerificationMutation.isPending ||
                      form.verificationStatus === "pending" ||
                      form.verificationStatus === "verified"
                    }
                    onClick={() => requestVerificationMutation.mutate()}
                    type="button"
                  >
                    {form.verificationStatus === "verified"
                      ? "Verified"
                      : form.verificationStatus === "pending"
                        ? "Request pending"
                        : requestVerificationMutation.isPending
                          ? "Requesting..."
                          : "Request verification"}
                  </button>
                </div>
                {requestVerificationMutation.error instanceof ApiError ? (
                  <p className="mt-3 text-sm text-[#b53c27]">
                    {requestVerificationMutation.error.message}
                  </p>
                ) : null}
              </div>
            </div>

            <label className="grid gap-2 text-sm text-[#65556c]">
              <span>Gender</span>
              <select
                className={fieldClass}
                onChange={(event) =>
                  {
                    setFieldErrors((current) => {
                      const next = { ...current };
                      delete next.gender;
                      return next;
                    });

                    setForm((current) => ({
                      ...current,
                      gender: event.target.value as ProfilePayload["gender"]
                    }));
                  }
                }
                value={form.gender}
              >
                <option value="">Please select</option>
                {genderOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {fieldErrors.gender ? (
                <span className="text-sm text-[#b53c27]">{fieldErrors.gender}</span>
              ) : null}
            </label>

            <label className="grid gap-2 text-sm text-[#65556c]">
              <span>Relationship intent</span>
              <select
                className={fieldClass}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    relationshipIntent: event.target.value as ProfilePayload["relationshipIntent"]
                  }))
                }
                value={form.relationshipIntent}
              >
                <option value="long_term">Long term</option>
                <option value="short_term">Short term</option>
                <option value="figuring_it_out">Figuring it out</option>
              </select>
            </label>
          </div>

          <label className="grid gap-2 text-sm text-[#65556c]">
            <span>Bio</span>
            <textarea
              className={`${fieldClass} min-h-32 resize-y`}
              ref={bioRef}
              onChange={(event) => {
                setFieldErrors((current) => {
                  const next = { ...current };
                  delete next.bio;
                  return next;
                });

                setForm((current) => ({ ...current, bio: event.target.value }));
              }}
              placeholder="Write a warm, specific intro about what you're like and what you want."
              value={form.bio}
            />
            {fieldErrors.bio ? (
              <span className="text-sm text-[#b53c27]">{fieldErrors.bio}</span>
            ) : null}
          </label>

          <div className="grid gap-3">
            <p className="text-sm font-semibold text-[#24162d]">Interested in</p>
            <div className="flex flex-wrap gap-2">
              {interestedInOptions.map((option) => (
                <button
                  className={
                    form.interestedIn.includes(option.value)
                      ? "rounded-full border border-[#24162d] bg-[#24162d] px-3 py-2 text-sm text-white"
                      : "rounded-full border border-[#24162d]/10 bg-white/60 px-3 py-2 text-sm text-[#24162d]"
                  }
                  key={option.value}
                  onClick={() => toggleInterestedIn(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-[#65556c]">
              Select one or more options. This works like a multi-select for who you want to see.
            </p>
            {fieldErrors.interestedIn ? (
              <p className="text-sm text-[#b53c27]">{fieldErrors.interestedIn}</p>
            ) : null}
          </div>

          <div className="grid gap-4">
            <p className="text-sm font-semibold text-[#24162d]">Prompts</p>
            {form.prompts.map((prompt, index) => (
              <div className="grid gap-3" key={`${index}-${prompt.question}`}>
                <label className="grid gap-2 text-sm text-[#65556c]">
                  <span>Prompt question {index + 1}</span>
                  <input
                    className={fieldClass}
                    onChange={(event) => updatePromptQuestion(index, event.target.value)}
                    placeholder="Write your own prompt question"
                    type="text"
                    value={prompt.question}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {promptQuestions.map((suggestion) => (
                    <button
                      className={
                        prompt.question === suggestion
                          ? "rounded-full border border-[#24162d] bg-[#24162d] px-3 py-2 text-xs font-semibold text-white"
                          : "rounded-full border border-[#24162d]/10 bg-white/60 px-3 py-2 text-xs font-semibold text-[#24162d]"
                      }
                      key={`${index}-${suggestion}`}
                      onClick={() => updatePromptQuestion(index, suggestion)}
                      type="button"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <label className="grid gap-2 text-sm text-[#65556c]">
                  <span>Answer</span>
                  <textarea
                    className={`${fieldClass} min-h-24 resize-y`}
                    ref={(element) => {
                      promptRefs.current[index] = element;
                    }}
                    onChange={(event) => updatePrompt(index, event.target.value)}
                    placeholder="Be specific. The answer should sound like a real person."
                    value={prompt.answer}
                  />
                  {fieldErrors[`prompts.${index}.answer`] ? (
                    <span className="text-sm text-[#b53c27]">
                      {fieldErrors[`prompts.${index}.answer`]}
                    </span>
                  ) : null}
                </label>
              </div>
            ))}
          </div>

          <div className="grid gap-3">
            <p className="text-sm font-semibold text-[#24162d]">Interests</p>
            <div className="flex flex-wrap gap-2">
              {form.interests.map((interest) => (
                <button
                  className="rounded-full border border-[#24162d]/10 bg-white/60 px-3 py-2 text-sm text-[#24162d]"
                  key={interest}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      interests: current.interests.filter((entry) => entry !== interest)
                    }))
                  }
                  type="button"
                >
                  {interest} x
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className={fieldClass}
                onChange={(event) => setInterestInput(event.target.value)}
                placeholder="Add interests like coffee, books, lifting"
                type="text"
                value={interestInput}
              />
              <button
                className="inline-flex items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-4 py-3 text-sm font-semibold text-white"
                onClick={addInterest}
                type="button"
              >
                Add
              </button>
            </div>
            {fieldErrors.interests ? (
              <p className="text-sm text-[#b53c27]">{fieldErrors.interests}</p>
            ) : null}
          </div>

          {saveProfileMutation.error &&
          (!(saveProfileMutation.error instanceof ApiError) || !saveProfileMutation.error.field) ? (
            <p className="text-sm text-[#b53c27]">{saveProfileMutation.error.message}</p>
          ) : null}

          <button
            className="inline-flex w-fit items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
            type="submit"
          >
            {saveProfileMutation.isPending
              ? "Saving profile..."
              : mode === "onboarding"
                ? "Save onboarding profile"
                : "Save profile changes"}
          </button>
        </form>

        <aside className={`${panelClass} h-fit`}>
          <p className={labelClass}>Preview</p>
          <div className="overflow-hidden rounded-[32px] bg-white">
            <div className="relative">
              {form.photoUrl ? (
                <img
                  alt="Profile preview"
                  className="aspect-[3/4] w-full object-cover"
                  src={form.photoUrl}
                />
              ) : (
                <div className="aspect-[3/4] w-full bg-[#24162d]/8" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#120b14]/82 via-[#120b14]/38 to-transparent px-6 pb-6 pt-20 text-white">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[0.72rem] uppercase tracking-[0.16em] text-white/70">
                      Live profile preview
                    </p>
                    <h3 className="mt-2 font-serif text-[clamp(1.8rem,4vw,2.6rem)] leading-[0.95]">
                      {sessionQuery.data?.user.name ?? "Your profile"}
                    </h3>
                    <p className="mt-2 text-sm uppercase tracking-[0.14em] text-white/78">
                      {sessionQuery.data?.user.city ?? "City"} • {form.relationshipIntent.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {form.verificationStatus === "verified" ? (
                      <span className="rounded-full bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#1a6b52]">
                        Verified
                      </span>
                    ) : form.verificationStatus === "pending" ? (
                      <span className="rounded-full bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#9a6400]">
                        Pending
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {form.photoUrls && form.photoUrls.length > 1 ? (
              <div className="border-t border-[#24162d]/8 bg-[#fffaf4] px-4 py-4">
                <div className="grid grid-cols-4 gap-3">
                  {form.photoUrls.map((photoUrl) => (
                    <img
                      alt="Secondary profile preview"
                      className="h-20 w-full rounded-[18px] object-cover"
                      key={photoUrl}
                      src={photoUrl}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 p-4 sm:p-6">
              <section className="rounded-[28px] bg-[#fffaf4] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#db5b43]">
                  About me
                </p>
                <p className="mt-3 text-lg leading-8 text-[#4b3b4f]">
                  {form.bio || "Your bio preview will show up here once you start writing."}
                </p>
              </section>

              <div className="grid gap-4">
                {form.prompts.map((prompt, index) => (
                  <article
                    className="rounded-3xl border border-white/80 bg-[rgba(255,251,246,0.78)] p-5"
                    key={`${index}-${prompt.question}`}
                  >
                    <p className="text-sm font-semibold text-[#db5b43]">
                      {prompt.question || `Prompt ${index + 1}`}
                    </p>
                    <p className="mt-2 text-base leading-7 text-[#65556c]">
                      {prompt.answer || "Answer this prompt to make your profile feel more personal."}
                    </p>
                  </article>
                ))}
              </div>

              {form.voiceIntroUrl ? (
                <section className="rounded-[28px] bg-[#fffaf4] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#db5b43]">
                    Voice intro
                  </p>
                  <audio className="mt-3 w-full" controls preload="none" src={form.voiceIntroUrl} />
                </section>
              ) : null}

              <section className="rounded-[28px] bg-[#fffaf4] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#db5b43]">
                  Interests
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {form.interests.length > 0 ? (
                    form.interests.map((interest) => (
                      <span
                        className="rounded-full border border-[#24162d]/10 bg-white px-3 py-2 text-sm font-medium text-[#24162d]"
                        key={interest}
                      >
                        {interest}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-[#65556c]">No interests added yet</span>
                  )}
                </div>
              </section>
            </div>
          </div>

          {profileQuery.data ? (
            <p className="mt-6 text-sm text-[#65556c]">
              {mode === "onboarding"
                ? "Existing profile found. Saving will update what you already have."
                : "Saving here updates your live dating profile immediately."}
            </p>
          ) : null}
        </aside>
      </div>

      {cropImageSrc ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#24162d]/70 px-4 py-8">
          <div className="w-full max-w-3xl rounded-[32px] border border-white/15 bg-[#fff7ee] p-6 shadow-[0_28px_90px_rgba(36,22,45,0.32)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={labelClass}>Crop photo</p>
                <h3 className="font-serif text-[clamp(1.6rem,3vw,2.4rem)] text-[#24162d]">
                  Frame your primary profile image.
                </h3>
                <p className="mt-2 max-w-[56ch] text-sm leading-6 text-[#65556c]">
                  Drag and zoom to lock in a strong 4:5 portrait crop for your profile card.
                </p>
              </div>
              <button
                className="rounded-full border border-[#24162d]/10 bg-white/60 px-4 py-2 text-sm font-semibold text-[#24162d]"
                onClick={closeCropModal}
                type="button"
              >
                Cancel
              </button>
            </div>

            <div className="relative mt-6 h-[420px] overflow-hidden rounded-[28px] bg-[#24162d]">
              <Cropper
                aspectRatio={4 / 5}
                autoCropArea={1}
                background={false}
                checkOrientation={false}
                dragMode="move"
                guides={false}
                modal={true}
                movable={true}
                ref={cropperRef}
                responsive={true}
                rotatable={false}
                scalable={false}
                src={cropImageSrc}
                style={{ height: "100%", width: "100%" }}
                viewMode={1}
                zoomOnTouch={true}
                zoomOnWheel={true}
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-5 py-3 text-sm font-semibold text-[#24162d]"
                onClick={closeCropModal}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-5 py-3 text-sm font-semibold text-[#24162d]"
                onClick={() => cropperRef.current?.cropper.zoom(-0.1)}
                type="button"
              >
                Zoom out
              </button>
              <button
                className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-5 py-3 text-sm font-semibold text-[#24162d]"
                onClick={() => cropperRef.current?.cropper.zoom(0.1)}
                type="button"
              >
                Zoom in
              </button>
              <button
                className="inline-flex items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
                onClick={confirmCrop}
                type="button"
              >
                {uploadPhotoMutation.isPending ? "Uploading..." : "Crop and upload"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function OnboardingPage() {
  return <ProfileEditorPage mode="onboarding" />;
}
