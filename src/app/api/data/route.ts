import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getMongoDatabase } from "@/lib/mongodb";

export const runtime = "nodejs";

type PatientRecord = { _id: string; data: unknown; updatedAt: Date };

function recordId(request: Request) {
  const token = request.headers.get("x-device-token") || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export async function GET(request: Request) {
  const id = recordId(request);
  if (!id) return NextResponse.json({ error: "Device session is missing." }, { status: 400 });

  try {
    const record = await (await getMongoDatabase()).collection<PatientRecord>("patientRecords").findOne({ _id: id });
    return NextResponse.json({ data: record?.data ?? null });
  } catch {
    return NextResponse.json({ error: "Database is not available." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const id = recordId(request);
  if (!id) return NextResponse.json({ error: "Device session is missing." }, { status: 400 });

  let body: { data?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data) || JSON.stringify(body.data).length > 1_500_000) {
    return NextResponse.json({ error: "Invalid or oversized health record." }, { status: 400 });
  }

  try {
    await (await getMongoDatabase()).collection<PatientRecord>("patientRecords").updateOne(
      { _id: id },
      { $set: { data: body.data, updatedAt: new Date() } },
      { upsert: true },
    );
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "Database is not available." }, { status: 503 });
  }
}
