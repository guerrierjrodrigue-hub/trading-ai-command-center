import { fail, ok, parseBody } from "@/lib/api";
import { positionSizeSchema } from "@/lib/validation";
import { computePositionSize } from "@/services/risk/position-sizing";

export async function POST(req: Request) {
  const parsed = await parseBody(req, positionSizeSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const result = computePositionSize(parsed.data);
    return ok(result);
  } catch (e) {
    return fail((e as Error).message);
  }
}
