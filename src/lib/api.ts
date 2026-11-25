import { NextResponse } from "next/server";
import { ZodError, type z, type ZodTypeAny } from "zod";
import { getSession } from "./auth";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, extra?: unknown): NextResponse {
  return NextResponse.json({ ok: false, error: message, extra }, { status });
}

/** Validates a request body against a Zod schema, returning typed data or a 400.
 * Generic over the schema so the parsed (output) type — with defaults applied — is inferred. */
/** Hard cap on request-body size. API payloads here are tiny; this bounds a
 * memory-exhaustion vector (e.g. oversized collections hitting Zod validation)
 * before any parsing happens. */
const MAX_BODY_BYTES = 100_000; // 100 KB

export async function parseBody<S extends ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<{ data: z.infer<S> } | { response: NextResponse }> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { response: fail("Invalid body") };
  }
  if (raw.length > MAX_BODY_BYTES) {
    return { response: fail("Request body too large", 413) };
  }
  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    return { response: fail("Invalid JSON body") };
  }
  try {
    return { data: schema.parse(json) as z.infer<S> };
  } catch (e) {
    if (e instanceof ZodError) {
      return { response: fail("Validation failed", 422, e.flatten()) };
    }
    return { response: fail("Validation error") };
  }
}

/** Returns the authenticated user id or a 401 response. */
export async function authUserId(): Promise<
  { userId: string } | { response: NextResponse }
> {
  const session = await getSession();
  if (!session?.sub) return { response: fail("Not authenticated", 401) };
  return { userId: session.sub };
}

// --- Very small in-memory rate limiter (per-process; enough for a personal app) ---
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}
