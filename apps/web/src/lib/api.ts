export const API_URL = "http://localhost:3001";

function getCookie(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

export class ApiError extends Error {
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.field = field;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit) {
  const hasJsonBody =
    init?.body !== undefined && !(typeof FormData !== "undefined" && init.body instanceof FormData);

  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
      ...(!["GET", "HEAD"].includes((init?.method ?? "GET").toUpperCase())
        ? { "X-CSRF-Token": getCookie("heartline_csrf") ?? "" }
        : {}),
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { message?: string; field?: string }
      | null;

    throw new ApiError(errorBody?.message ?? "Request failed.", errorBody?.field);
  }

  return (await response.json()) as T;
}
