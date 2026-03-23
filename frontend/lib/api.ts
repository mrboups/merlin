import { API_URL } from "./constants";

type RequestOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

class ApiClient {
  private baseUrl: string;
  private getAccessToken: (() => Promise<string | null>) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setAccessTokenGetter(getter: () => Promise<string | null>) {
    this.getAccessToken = getter;
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<{ data: T | null; error: string | null }> {
    const url = `${this.baseUrl}${path}`;

    if (!this.baseUrl) {
      console.error("[API] Base URL not configured");
      return { data: null, error: "API not configured — no base URL set" };
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...options.headers,
      };

      if (this.getAccessToken) {
        try {
          const token = await this.getAccessToken();
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
            console.log(`[API] ${options.method || "GET"} ${path} — token: ${token.slice(0, 20)}...`);
          } else {
            console.warn("[API] getAccessToken returned null — sending request without auth");
          }
        } catch (tokenErr) {
          console.error("[API] Failed to get access token:", tokenErr);
          return { data: null, error: `Auth token error: ${tokenErr instanceof Error ? tokenErr.message : "unknown"}` };
        }
      } else {
        console.warn("[API] No access token getter set — sending request without auth");
      }

      console.log(`[API] → ${options.method || "GET"} ${url}`);
      // 90-second timeout for long operations (trade execution)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      const response = await fetch(url, { ...options, headers, signal: options.signal || controller.signal });
      clearTimeout(timeout);
      console.log(`[API] ← ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        let errorDetail = `${response.status} ${response.statusText}`;

        // Try to parse JSON error
        try {
          const parsed = JSON.parse(errorBody);
          if (parsed.error?.message) {
            errorDetail = `${response.status}: ${parsed.error.message}`;
          } else if (parsed.detail) {
            errorDetail = `${response.status}: ${parsed.detail}`;
          }
        } catch {
          if (errorBody) errorDetail = `${response.status}: ${errorBody.slice(0, 200)}`;
        }

        console.error(`[API] Error: ${errorDetail}`);
        return { data: null, error: errorDetail };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      console.error(`[API] Network error for ${url}:`, message);

      if (err instanceof DOMException && err.name === "AbortError") {
        return { data: null, error: "Request timed out. The operation may still be processing — check your trades." };
      }
      if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
        return { data: null, error: "Network error — please try again." };
      }
      return { data: null, error: message };
    }
  }

  async get<T>(path: string) {
    return this.request<T>(path, { method: "GET" });
  }

  async post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }
}

export const apiClient = new ApiClient(API_URL);
