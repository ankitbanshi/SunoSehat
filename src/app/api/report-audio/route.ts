import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Sarvam API key is missing. Add SARVAM_API_KEY to .env." }, { status: 503 });

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 2500) {
    return NextResponse.json({ error: "Hindi audio text must be between 1 and 2,500 characters." }, { status: 400 });
  }

  const response = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-subscription-key": apiKey },
    body: JSON.stringify({
      text: body.text,
      model: "bulbul:v3",
      speaker: "priya",
      language_code: "hi-IN",
      output_audio_codec: "mp3",
      pace: 1,
    }),
  });

  if (!response.ok) return NextResponse.json({ error: "Hindi speech is unavailable right now." }, { status: 502 });
  const result = await response.json();
  if (!Array.isArray(result.audios) || typeof result.audios[0] !== "string") {
    return NextResponse.json({ error: "Sarvam returned no Hindi audio." }, { status: 502 });
  }

  return new Response(Buffer.from(result.audios[0], "base64"), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
