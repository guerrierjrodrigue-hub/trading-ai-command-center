"use client";

import { useCallback, useEffect, useState } from "react";

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  extra?: unknown;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json()) as ApiResult<T>;
  if (!json.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json.data as T;
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as ApiResult<T>;
  if (!json.ok) {
    const err = new Error(json.error ?? `Request failed (${res.status})`);
    (err as any).extra = json.extra;
    throw err;
  }
  return json.data as T;
}

export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);

  const refetch = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<T>(url));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, error, loading, refetch, setData };
}
