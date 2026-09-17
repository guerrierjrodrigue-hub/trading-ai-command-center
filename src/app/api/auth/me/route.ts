import { getCurrentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/api";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("Not authenticated", 401);
  return ok({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    setting: user.setting,
  });
}
