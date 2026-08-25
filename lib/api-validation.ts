import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * Parse and validate a JSON request body against a schema.
 *
 * Returns either the parsed value or the response to send back, so a route
 * reads as:
 *
 *     const parsed = await parseBody(req, Schema);
 *     if ("response" in parsed) return parsed.response;
 *
 * Routes used to hand-check bodies, which let bad input through as the wrong
 * type rather than a 400: `Number("abc")` reached Prisma as NaN and came back
 * to the caller as a 500, and a `null` where an enum was expected skipped a
 * truthiness guard and failed the same way.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { response: badRequest(result.error) };
  }

  return { data: result.data };
}

/** Validate already-parsed input (query parameters, route params). */
export function parseOrBadRequest<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown
): { data: z.infer<T> } | { response: NextResponse } {
  const result = schema.safeParse(input);
  if (!result.success) return { response: badRequest(result.error) };
  return { data: result.data };
}

/** One shape for every validation failure, with the offending fields named. */
function badRequest(error: z.ZodError): NextResponse {
  return NextResponse.json(
    {
      error: "Invalid request",
      issues: error.issues.map((issue) => ({
        path: issue.path.join(".") || "(body)",
        message: issue.message,
      })),
    },
    { status: 400 }
  );
}
