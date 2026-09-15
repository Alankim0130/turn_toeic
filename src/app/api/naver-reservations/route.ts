import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { htmlToText } from "@/lib/naver-reservation";
import { ingestNaverText } from "@/lib/naver-ingest";

/**
 * 네이버 예약 알림 연결 주소.
 * 네이버가 보낸 예약 알림(문자·메일·앱 알림)의 원문을 그대로 보내면 날짜·시각을 뽑아 저장하고 스태프에게 푸시한다.
 *
 * 인증: Authorization: Bearer <NAVER_WEBHOOK_SECRET>  (또는 X-Webhook-Secret 헤더)
 * 본문:  JSON { "text": "원문" }  /  JSON { "subject", "text" | "html" }  /  text/plain  /  form(text, html, subject)
 */

const MAX_BYTES = 64 * 1024;

function authorized(req: NextRequest) {
  const secret = process.env.NAVER_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : (req.headers.get("x-webhook-secret") ?? "").trim();
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const pickStrings = (values: unknown[]) => values.filter((v): v is string => typeof v === "string" && v.trim() !== "");

async function readText(req: NextRequest): Promise<{ text: string; source: string }> {
  const type = req.headers.get("content-type") ?? "";

  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return { text: "", source: "webhook" };
    let text = pickStrings([body.subject, body.title, body.text, body.body, body.message, body.content]).join("\n");
    if (!text && typeof body.html === "string") text = htmlToText(body.html);
    const source = typeof body.source === "string" && body.source ? body.source : "webhook";
    return { text, source };
  }

  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await req.formData();
    let text = pickStrings(["subject", "text", "body", "message", "plain", "body-plain", "stripped-text"].map((k) => form.get(k))).join("\n");
    const html = form.get("html") ?? form.get("body-html");
    if (!text && typeof html === "string") text = htmlToText(html);
    return { text, source: "email" };
  }

  const raw = await req.text();
  return { text: /^\s*</.test(raw) ? htmlToText(raw) : raw, source: "webhook" };
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return NextResponse.json({ ok: false, error: "too large" }, { status: 413 });

  const { text, source } = await readText(req);
  if (!text.trim()) return NextResponse.json({ ok: false, error: "empty text" }, { status: 400 });
  if (text.length > MAX_BYTES) return NextResponse.json({ ok: false, error: "too large" }, { status: 413 });

  try {
    const result = await ingestNaverText(text, source);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[naver-reservations]", error);
    return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });
  }
}
