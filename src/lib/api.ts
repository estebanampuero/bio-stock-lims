// HTTP client centralizado con JWT Bearer + persistencia en localStorage + redirect en 401

export const TOKEN_KEY = "biostock_token";
export const USER_KEY  = "biostock_user";

let authToken: string | null = (typeof localStorage !== "undefined") ? localStorage.getItem(TOKEN_KEY) : null;

export function getToken(): string | null { return authToken; }

export function setToken(t: string | null) {
  authToken = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else   localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const headers = new Headers(opts.headers || {});
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  if (opts.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`/api/v1${path}`, { ...opts, headers });
  if (res.status === 401 && path !== "/login") {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    if (!window.location.search.includes("noreload")) window.location.reload();
  }
  return res;
}
