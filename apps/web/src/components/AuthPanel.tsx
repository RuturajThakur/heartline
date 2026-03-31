import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiFetch } from "../lib/api";
import {
  isProfileComplete,
  normalizeProfilePayload,
  type ProfilePayload,
  type SessionUser
} from "../lib/profile";

type AuthPayload = {
  email: string;
  password: string;
  confirmPassword?: string;
  name?: string;
  birthDate?: string;
};

const panelClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.76)] p-7 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const labelClass = "mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]";
const fieldClass =
  "w-full rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none transition placeholder:text-[#65556c]/70 focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15";
const pillBase =
  "rounded-full border px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5";

export function AuthPanel() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState<AuthPayload>({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
    birthDate: ""
  });

  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: () => apiFetch<{ user: SessionUser }>("/api/auth/me"),
    retry: false
  });

  const authMutation = useMutation({
    mutationFn: async () => {
      if (mode === "register") {
        if (form.password !== form.confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        return apiFetch<{ user: SessionUser }>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            name: form.name,
            birthDate: form.birthDate
          })
        });
      }

      return apiFetch<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.email,
          password: form.password
        })
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["auth-session"]
      });

      const profileResult = await queryClient.fetchQuery<ProfilePayload | null>({
        queryKey: ["dating-profile"],
        queryFn: async () => {
          const result = await apiFetch<{ profile: ProfilePayload | null }>("/api/profile");
          return result.profile ? normalizeProfilePayload(result.profile) : null;
        }
      });

      navigate({
        to: profileResult && isProfileComplete(profileResult) ? "/product" : "/onboarding"
      });
    }
  });

  const logoutMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/api/auth/logout", {
        method: "POST"
      }),
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: ["dating-profile"]
      });
      queryClient.removeQueries({
        queryKey: ["discovery-feed"]
      });
      queryClient.removeQueries({
        queryKey: ["matches"]
      });
      queryClient.removeQueries({
        queryKey: ["conversations"]
      });
      queryClient.removeQueries({
        queryKey: ["incoming-likes"]
      });
      queryClient.removeQueries({
        queryKey: ["notifications"]
      });
      queryClient.setQueryData(["auth-session"], null);
      await queryClient.invalidateQueries({
        queryKey: ["auth-session"]
      });
      navigate({
        to: "/"
      });
    }
  });

  function updateField<Key extends keyof AuthPayload>(key: Key, value: AuthPayload[Key]) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  return (
    <section className={`${panelClass} lg:sticky lg:top-8`}>
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className={labelClass}>Get inside</p>
          <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
            Login or create your profile.
          </h2>
          <p className="mt-3 max-w-[42ch] text-sm leading-6 text-[#65556c]">
            Start with login if you already have an account. Register if you are new and we
            will take you straight into onboarding.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={
              mode === "login"
                ? `${pillBase} border-[#24162d] bg-[#24162d] text-white`
                : `${pillBase} border-[#24162d]/10 bg-white/60 text-[#24162d]`
            }
            onClick={() => setMode("login")}
            type="button"
          >
            Login
          </button>
          <button
            className={
              mode === "register"
                ? `${pillBase} border-[#24162d] bg-[#24162d] text-white`
                : `${pillBase} border-[#24162d]/10 bg-white/60 text-[#24162d]`
            }
            onClick={() => setMode("register")}
            type="button"
          >
            Register
          </button>
        </div>
      </div>

      {sessionQuery.data?.user ? (
        <div className="mt-6 grid gap-3">
          <p className="text-lg font-semibold text-[#24162d]">
            Signed in as {sessionQuery.data.user.name}
          </p>
          <p className="text-base leading-7 text-[#65556c]">
            {sessionQuery.data.user.email} {" | "} {sessionQuery.data.user.city}
          </p>
          <button
            className="inline-flex w-fit items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-5 py-3 text-sm font-semibold text-[#24162d] transition hover:-translate-y-0.5"
            onClick={() => logoutMutation.mutate()}
            type="button"
          >
            {logoutMutation.isPending ? "Signing out..." : "Logout"}
          </button>
        </div>
      ) : (
        <form
          className="mt-6 grid max-w-[32rem] gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            authMutation.mutate();
          }}
        >
          {mode === "register" ? (
            <>
              <label className="grid gap-2 text-sm text-[#65556c]">
                <span>Name</span>
                <input
                  className={fieldClass}
                  onChange={(event) => updateField("name", event.target.value)}
                  type="text"
                  value={form.name ?? ""}
                />
              </label>
              <label className="grid gap-2 text-sm text-[#65556c]">
                <span>Birth date</span>
                <input
                  className={fieldClass}
                  onChange={(event) => updateField("birthDate", event.target.value)}
                  type="date"
                  value={form.birthDate ?? ""}
                />
              </label>
            </>
          ) : null}

          <label className="grid gap-2 text-sm text-[#65556c]">
            <span>Email</span>
            <input
              className={fieldClass}
              onChange={(event) => updateField("email", event.target.value)}
              type="email"
              value={form.email}
            />
          </label>

          <label className="grid gap-2 text-sm text-[#65556c]">
            <span>Password</span>
            <input
              className={fieldClass}
              onChange={(event) => updateField("password", event.target.value)}
              type="password"
              value={form.password}
            />
          </label>

          {mode === "register" ? (
            <label className="grid gap-2 text-sm text-[#65556c]">
              <span>Confirm password</span>
              <input
                className={fieldClass}
                onChange={(event) => updateField("confirmPassword", event.target.value)}
                type="password"
                value={form.confirmPassword ?? ""}
              />
            </label>
          ) : null}

          {authMutation.error ? (
            <p className="text-sm text-[#b53c27]">{authMutation.error.message}</p>
          ) : null}
          {sessionQuery.isError ? (
            <p className="text-sm text-[#65556c]">
              No active session yet. Register or log in to test auth.
            </p>
          ) : null}

          <button
            className="inline-flex w-fit items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
            type="submit"
          >
            {authMutation.isPending
              ? "Submitting..."
              : mode === "register"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
      )}
    </section>
  );
}
