import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Sarvam API key is missing. Add SARVAM_API_KEY to .env." }, { status: 503 });
  }

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 1000) {
    return NextResponse.json({ error: "Text must be between 1 and 1,000 characters." }, { status: 400 });
  }

  const response = await fetch("https://api.sarvam.ai/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-subscription-key": apiKey },
    body: JSON.stringify({
      input: body.text,
      source_language_code: "auto",
      target_language_code: "hi-IN",
      model: "mayura:v1",
      mode: "modern-colloquial",
      output_script: "fully-native",
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Hindi translation is unavailable right now." }, { status: 502 });
  }

  const result = await response.json();
  if (typeof result.translated_text !== "string" || !result.translated_text.trim()) {
    return NextResponse.json({ error: "Sarvam returned no translated text." }, { status: 502 });
  }

  return NextResponse.json({ translatedText: result.translated_text });
}
