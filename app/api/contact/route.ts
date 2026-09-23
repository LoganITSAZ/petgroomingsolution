import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { contactBody, allowContactAttempt, clientKey } from "@/lib/contact-form";
import { sendContactMessage } from "@/lib/email";

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Please send your message from our contact page." }, { status: 403 });
  }
  if (!allowContactAttempt(clientKey(req.headers))) {
    return NextResponse.json({ error: "Please wait a few minutes before trying again." }, { status: 429 });
  }
  // Bound the bytes actually read, including requests without Content-Length.
  const reader = req.body?.getReader();
  if (!reader) return NextResponse.json({ error: "A message is required." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  let raw: unknown;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_000) {
        await reader.cancel();
        return NextResponse.json({ error: "Your message is too long." }, { status: 413 });
      }
      chunks.push(value);
    }
    raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Please check your message and try again." }, { status: 400 });
  }
  const parsed = contactBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Enter your name, a valid email, and a message of 10–5,000 characters." }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ error: "Unable to send this message." }, { status: 400 });
  try {
    const config = await getConfig();
    if (!config.contactFormEnabled || !config.contactRecipient || !process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Messaging is currently unavailable. Please call the shop." }, { status: 503 });
    }
    if (config.contactRequirePhone && !parsed.data.phone) {
      return NextResponse.json({ error: "Please include your phone number." }, { status: 400 });
    }
    await sendContactMessage({ ...parsed.data, to: config.contactRecipient });
    return NextResponse.json({ message: config.contactSuccessMessage });
  } catch {
    return NextResponse.json({ error: "Your message could not be sent. Please try again or call the shop." }, { status: 502 });
  }
}
