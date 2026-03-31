export type ProfilePayload = {
  bio: string;
  relationshipIntent: "long_term" | "short_term" | "figuring_it_out";
  gender: "" | "man" | "woman" | "non_binary" | "prefer_not_to_say";
  interestedIn: Array<"men" | "women" | "all">;
  prompts: Array<{ question: string; answer: string }>;
  interests: string[];
  photoUrl?: string | null;
  photoUrls?: string[];
  voiceIntroUrl?: string | null;
  verificationStatus?: "unverified" | "pending" | "verified";
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  birthDate: string;
  city: string;
  role: "user" | "admin";
  status?: "active" | "suspended" | "banned";
  createdAt: string;
};

export const promptQuestions = [
  "A green flag I bring into a relationship is...",
  "My ideal Sunday looks like...",
  "The kind of connection I want is..."
];

export const genderOptions = [
  { value: "man", label: "Man" },
  { value: "woman", label: "Woman" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" }
] as const;

export const interestedInOptions = [
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "all", label: "All" }
] as const;

export const defaultProfileForm: ProfilePayload = {
  bio: "",
  relationshipIntent: "long_term",
  gender: "",
  interestedIn: [],
  prompts: promptQuestions.slice(0, 2).map((question) => ({ question, answer: "" })),
  interests: []
};

export function isGenderValue(value: unknown): value is ProfilePayload["gender"] {
  return genderOptions.some((option) => option.value === value);
}

export function isInterestedInValue(
  value: unknown
): value is ProfilePayload["interestedIn"][number] {
  return interestedInOptions.some((option) => option.value === value);
}

export function normalizeProfilePayload(profile: unknown): ProfilePayload {
  if (!profile || typeof profile !== "object") {
    return defaultProfileForm;
  }

  const input = profile as Record<string, unknown>;
  const promptsSource = Array.isArray(input.prompts)
    ? input.prompts
    : typeof input.prompts === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(input.prompts);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  return {
    bio: typeof input.bio === "string" ? input.bio : defaultProfileForm.bio,
    relationshipIntent:
      input.relationshipIntent === "short_term" || input.relationshipIntent === "figuring_it_out"
        ? input.relationshipIntent
        : "long_term",
    gender: isGenderValue(input.gender) ? input.gender : defaultProfileForm.gender,
    interestedIn: Array.isArray(input.interestedIn)
      ? input.interestedIn.filter(isInterestedInValue)
      : [],
    prompts: promptsSource
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const prompt = entry as Record<string, unknown>;
        const fallbackQuestion = promptQuestions[index] ?? `Prompt ${index + 1}`;

        return {
          question:
            typeof prompt.question === "string" && prompt.question.length > 0
              ? prompt.question
              : fallbackQuestion,
          answer: typeof prompt.answer === "string" ? prompt.answer : ""
        };
      })
      .filter((entry): entry is { question: string; answer: string } => entry !== null)
      .slice(0, 3),
    interests: Array.isArray(input.interests)
      ? input.interests.filter((entry): entry is string => typeof entry === "string")
      : [],
    photoUrl: typeof input.photoUrl === "string" ? input.photoUrl : null,
    photoUrls: Array.isArray(input.photoUrls)
      ? input.photoUrls.filter((entry): entry is string => typeof entry === "string")
      : typeof input.photoUrl === "string"
        ? [input.photoUrl]
        : [],
    voiceIntroUrl: typeof input.voiceIntroUrl === "string" ? input.voiceIntroUrl : null,
    verificationStatus:
      input.verificationStatus === "pending" || input.verificationStatus === "verified"
        ? input.verificationStatus
        : "unverified"
  };
}

export function isProfileComplete(profile: ProfilePayload | null) {
  if (!profile) {
    return false;
  }

  const bio = typeof profile.bio === "string" ? profile.bio : "";
  const gender = typeof profile.gender === "string" ? profile.gender : "";
  const interestedIn = Array.isArray(profile.interestedIn) ? profile.interestedIn : [];
  const prompts = Array.isArray(profile.prompts) ? profile.prompts : [];
  const interests = Array.isArray(profile.interests) ? profile.interests : [];

  return (
    bio.trim().length >= 20 &&
    gender !== "" &&
    interestedIn.length >= 1 &&
    prompts.length >= 2 &&
    prompts.every(
      (prompt) =>
        prompt &&
        typeof prompt === "object" &&
        typeof prompt.answer === "string" &&
        prompt.answer.trim().length >= 10
    ) &&
    interests.length >= 3
  );
}

export function getProfileCompletion(profile: ProfilePayload | null) {
  const missing: string[] = [];

  if (!(profile?.photoUrls?.length || profile?.photoUrl)) {
    missing.push("Add a primary photo");
  }

  if (!profile?.voiceIntroUrl) {
    missing.push("Add a voice intro");
  }

  if (profile?.verificationStatus !== "verified") {
    missing.push("Request verification");
  }

  if (!profile?.bio || profile.bio.trim().length < 20) {
    missing.push("Write a longer bio");
  }

  if (!profile?.gender) {
    missing.push("Choose your gender");
  }

  if (!profile?.interestedIn?.length) {
    missing.push("Choose who you are interested in");
  }

  const validPromptAnswers = (profile?.prompts ?? []).filter(
    (prompt) => typeof prompt.answer === "string" && prompt.answer.trim().length >= 10
  ).length;

  if (validPromptAnswers < 2) {
    missing.push("Answer at least two prompts");
  }

  if ((profile?.interests ?? []).length < 3) {
    missing.push("Add at least three interests");
  }

  const totalChecks = 8;
  const completedChecks = totalChecks - missing.length;

  return {
    missing,
    completedChecks,
    totalChecks,
    percent: Math.round((completedChecks / totalChecks) * 100)
  };
}
