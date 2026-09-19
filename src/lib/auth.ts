import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "./env";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "tacc_session";
const BCRYPT_COST = 12;

const secretKey = new TextEncoder().encode(env.authSecret);

export interface SessionPayload {
  sub: string; // user id
  email: string;
  [key: string]: unknown;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${env.sessionMaxAge}s`)
    .sign(secretKey);
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/** Sets the session cookie (call from a Route Handler / Server Action). */
export async function setSessionCookie(token: string): Promise<void> {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.authCookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: env.sessionMaxAge,
  });
}

export async function clearSessionCookie(): Promise<void> {
  cookies().delete(SESSION_COOKIE);
}

/** Reads the current session payload from the request cookie. */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Loads the current user from DB, or null. */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session?.sub) return null;
  return prisma.user.findUnique({
    where: { id: session.sub },
    include: { setting: true },
  });
}

/** Throws if there is no authenticated user. Use inside protected handlers. */
export async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session?.sub) {
    throw new AuthError("Not authenticated");
  }
  return session.sub;
}

export class AuthError extends Error {}
