import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import {
  isProfileComplete,
  normalizeProfilePayload,
  type ProfilePayload,
  type SessionUser
} from "../lib/profile";

export function useSessionProfile() {
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
    enabled: sessionQuery.isSuccess && sessionQuery.data.user.status === "active",
    staleTime: 30_000
  });

  return {
    sessionQuery,
    profileQuery,
    hasCompleteProfile: isProfileComplete(profileQuery.data ?? null)
  };
}
