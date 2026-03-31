import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSessionProfile } from "../hooks/useSessionProfile";
import { ApiError, apiFetch } from "../lib/api";

type AccountPayload = {
  name: string;
  birthDate: string;
  city: string;
};

type PasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

type DeleteAccountPayload = {
  currentPassword: string;
  confirmText: string;
};
type AppealPayload = {
  message: string;
};

const panelClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.76)] p-7 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const fieldClass =
  "w-full rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none transition placeholder:text-[#65556c]/70 focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15";
const labelClass = "mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { sessionQuery } = useSessionProfile();
  const [accountForm, setAccountForm] = useState<AccountPayload>({
    name: "",
    birthDate: "",
    city: ""
  });
  const [passwordForm, setPasswordForm] = useState<PasswordPayload>({
    currentPassword: "",
    newPassword: ""
  });
  const [deleteForm, setDeleteForm] = useState<DeleteAccountPayload>({
    currentPassword: "",
    confirmText: ""
  });
  const [appealForm, setAppealForm] = useState<AppealPayload>({
    message: ""
  });

  useEffect(() => {
    if (sessionQuery.data?.user) {
      setAccountForm({
        name: sessionQuery.data.user.name,
        birthDate: sessionQuery.data.user.birthDate,
        city: sessionQuery.data.user.city
      });
    }
  }, [sessionQuery.data]);

  const accountMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ user: { id: string; email: string; name: string; birthDate: string; city: string; createdAt: string } }>(
        "/api/auth/account",
        {
          method: "PATCH",
          body: JSON.stringify(accountForm)
        }
      ),
    onSuccess: async (result) => {
      queryClient.setQueryData(["auth-session"], result);
      await queryClient.invalidateQueries({
        queryKey: ["auth-session"]
      });
    }
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/api/auth/password", {
        method: "POST",
        body: JSON.stringify(passwordForm)
      }),
    onSuccess: () => {
      setPasswordForm({
        currentPassword: "",
        newPassword: ""
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
      queryClient.setQueryData(["auth-session"], null);
      await queryClient.invalidateQueries({
        queryKey: ["auth-session"]
      });
      navigate({
        to: "/"
      });
    }
  });
  const deleteAccountMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/api/auth/account", {
        method: "DELETE",
        body: JSON.stringify(deleteForm)
      }),
    onSuccess: async () => {
      queryClient.clear();
      navigate({
        to: "/"
      });
    }
  });
  const appealMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/api/appeals", {
        method: "POST",
        body: JSON.stringify(appealForm)
      }),
    onSuccess: () => {
      setAppealForm({
        message: ""
      });
    }
  });

  if (sessionQuery.isError) {
    return <Navigate to="/" />;
  }

  if (sessionQuery.isLoading || sessionQuery.isPending) {
    return (
      <section className={panelClass}>
        <p className={labelClass}>Settings</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] text-[#24162d]">
          Loading your settings.
        </h2>
      </section>
    );
  }

  return (
    <section className="grid gap-6">
      <div className={panelClass}>
        <p className={labelClass}>Settings</p>
        <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
          Account management.
        </h2>
        <p className="mt-4 text-base leading-7 text-[#65556c]">
          Update your account details here without going back through onboarding.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <form
          className={`${panelClass} grid gap-4`}
          onSubmit={(event) => {
            event.preventDefault();
            accountMutation.mutate();
          }}
        >
          <div>
            <p className={labelClass}>Profile basics</p>
            <h3 className="font-serif text-2xl text-[#24162d]">Account details</h3>
          </div>

          <label className="grid gap-2 text-sm text-[#65556c]">
            <span>Name</span>
            <input
              className={fieldClass}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  name: event.target.value
                }))
              }
              type="text"
              value={accountForm.name}
            />
          </label>

          <label className="grid gap-2 text-sm text-[#65556c]">
            <span>Birth date</span>
            <input
              className={fieldClass}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  birthDate: event.target.value
                }))
              }
              type="date"
              value={accountForm.birthDate}
            />
          </label>

          <label className="grid gap-2 text-sm text-[#65556c]">
            <span>City</span>
            <input
              className={fieldClass}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  city: event.target.value
                }))
              }
              type="text"
              value={accountForm.city}
            />
          </label>

          {accountMutation.error instanceof ApiError ? (
            <p className="text-sm text-[#b53c27]">{accountMutation.error.message}</p>
          ) : null}

          <button
            className="inline-flex w-fit items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
            type="submit"
          >
            {accountMutation.isPending ? "Saving..." : "Save account details"}
          </button>
        </form>

        <form
          className={`${panelClass} grid gap-4`}
          onSubmit={(event) => {
            event.preventDefault();
            passwordMutation.mutate();
          }}
        >
          <div>
            <p className={labelClass}>Security</p>
            <h3 className="font-serif text-2xl text-[#24162d]">Change password</h3>
          </div>

          <label className="grid gap-2 text-sm text-[#65556c]">
            <span>Current password</span>
            <input
              className={fieldClass}
              onChange={(event) =>
                setPasswordForm((current) => ({
                  ...current,
                  currentPassword: event.target.value
                }))
              }
              type="password"
              value={passwordForm.currentPassword}
            />
          </label>

          <label className="grid gap-2 text-sm text-[#65556c]">
            <span>New password</span>
            <input
              className={fieldClass}
              onChange={(event) =>
                setPasswordForm((current) => ({
                  ...current,
                  newPassword: event.target.value
                }))
              }
              type="password"
              value={passwordForm.newPassword}
            />
          </label>

          {passwordMutation.error instanceof ApiError ? (
            <p className="text-sm text-[#b53c27]">{passwordMutation.error.message}</p>
          ) : null}

          <button
            className="inline-flex w-fit items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
            type="submit"
          >
            {passwordMutation.isPending ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>

      <div className={`${panelClass} grid gap-4`}>
        <div>
          <p className={labelClass}>Account actions</p>
          <h3 className="font-serif text-2xl text-[#24162d]">Quick links</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-5 py-3 text-sm font-semibold text-[#24162d]"
            to="/edit-profile"
          >
            Edit dating profile
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-5 py-3 text-sm font-semibold text-[#24162d]"
            to="/blocked"
          >
            Manage blocked list
          </Link>
          <button
            className="inline-flex items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white"
            onClick={() => logoutMutation.mutate()}
            type="button"
          >
            {logoutMutation.isPending ? "Signing out..." : "Logout"}
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-5 py-3 text-sm font-semibold text-[#24162d]"
            onClick={() =>
              setDeleteForm((current) => ({
                ...current,
                confirmText: current.confirmText
              }))
            }
            type="button"
          >
            Delete account
          </button>
        </div>
        <div className="grid gap-3 rounded-[24px] border border-[#b53c27]/15 bg-[#fff1ed] p-4">
          <p className="text-sm leading-6 text-[#65556c]">
            To permanently delete your account, enter your current password and type <strong>DELETE</strong>.
          </p>
          <label className="grid gap-2 text-sm text-[#65556c]">
            <span>Current password</span>
            <input
              className={fieldClass}
              onChange={(event) =>
                setDeleteForm((current) => ({
                  ...current,
                  currentPassword: event.target.value
                }))
              }
              type="password"
              value={deleteForm.currentPassword}
            />
          </label>
          <label className="grid gap-2 text-sm text-[#65556c]">
            <span>Type DELETE to confirm</span>
            <input
              className={fieldClass}
              onChange={(event) =>
                setDeleteForm((current) => ({
                  ...current,
                  confirmText: event.target.value
                }))
              }
              type="text"
              value={deleteForm.confirmText}
            />
          </label>
          <div>
            <button
              className="inline-flex items-center justify-center rounded-full border border-[#b53c27]/20 bg-[#b53c27] px-5 py-3 text-sm font-semibold text-white"
              onClick={() => deleteAccountMutation.mutate()}
              type="button"
            >
              {deleteAccountMutation.isPending ? "Deleting..." : "Permanently delete account"}
            </button>
          </div>
          {deleteAccountMutation.error instanceof ApiError ? (
            <p className="text-sm text-[#b53c27]">{deleteAccountMutation.error.message}</p>
          ) : null}
        </div>
      </div>

      {sessionQuery.data?.user.status && sessionQuery.data.user.status !== "active" ? (
        <div className={`${panelClass} grid gap-4`}>
          <div>
            <p className={labelClass}>Account status</p>
            <h3 className="font-serif text-2xl text-[#24162d]">
              {sessionQuery.data.user.status === "suspended"
                ? "Your account is suspended"
                : "Your account is banned"}
            </h3>
          </div>
          <p className="text-base leading-7 text-[#65556c]">
            You can submit an appeal for review here.
          </p>
          <label className="grid gap-2 text-sm text-[#65556c]">
            <span>Appeal message</span>
            <textarea
              className="min-h-32 rounded-3xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none transition placeholder:text-[#65556c]/70 focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
              onChange={(event) =>
                setAppealForm({
                  message: event.target.value
                })
              }
              placeholder="Explain why you think the action should be reviewed."
              value={appealForm.message}
            />
          </label>
          {appealMutation.error instanceof ApiError ? (
            <p className="text-sm text-[#b53c27]">{appealMutation.error.message}</p>
          ) : null}
          <button
            className="inline-flex w-fit items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white"
            onClick={() => appealMutation.mutate()}
            type="button"
          >
            {appealMutation.isPending ? "Submitting..." : "Submit appeal"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
