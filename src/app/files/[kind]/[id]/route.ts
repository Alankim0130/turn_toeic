import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isImageType } from "@/lib/upload";

/**
 * 비공개 파일 열기: /files/material/12 · /files/homework/34 · /files/audio/56 · /files/textbook/78 · /files/item/9
 *  - item = 비대면 자료 회차 자료실(study_material_items, 스태프만 — 학생은 그 달에 적용된 material 로 받는다)
 *  - 사용자 세션으로 행을 조회하므로 RLS 가 접근 권한을 정한다 (못 보면 404).
 *  - 저장소 서명 URL 도 사용자 세션으로 만들어 storage 정책을 한 번 더 통과한다.
 *  - ?download=1 은 원본 파일명으로 내려받기, 숙제 사진·교재 이미지는 ?w=400 으로 썸네일.
 */
const BUCKET = { material: "study-materials", item: "study-materials", homework: "homework", audio: "lc-audio", textbook: "lc-textbooks" } as const;
type Kind = keyof typeof BUCKET;

const notFound = () =>
  new NextResponse("파일을 찾을 수 없거나 열람 권한이 없어요.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind: kindParam, id: idParam } = await params;
  const id = Number(idParam);
  if (!(kindParam in BUCKET) || !Number.isInteger(id) || id <= 0) return notFound();
  const kind = kindParam as Kind;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  const cols = "file_path, file_name, content_type";
  const { data: row } =
    kind === "material"
      ? await supabase.from("study_materials").select(cols).eq("id", id).maybeSingle()
      : kind === "item"
        ? await supabase.from("study_material_items").select(cols).eq("id", id).maybeSingle()
      : kind === "homework"
        ? await supabase.from("homework_files").select(cols).eq("id", id).maybeSingle()
        : kind === "textbook"
          ? await supabase.from("lc_books").select("file_path:cover_path, file_name:cover_name, content_type:cover_type").eq("id", id).maybeSingle()
          : await supabase.from("lc_audio_tracks").select(cols).eq("id", id).maybeSingle();
  if (!row?.file_path || !row.file_name) return notFound();

  const sp = request.nextUrl.searchParams;
  const width = Number(sp.get("w"));
  const thumb = (kind === "homework" || kind === "textbook") && isImageType(row.content_type) && width >= 80 && width <= 1200;
  // 음원은 재생 중 구간 요청이 이어지므로 넉넉히, 나머지는 짧게
  const expiresIn = kind === "audio" ? 6 * 60 * 60 : 10 * 60;

  const { data, error } = await supabase.storage.from(BUCKET[kind]).createSignedUrl(row.file_path, expiresIn, {
    transform: thumb ? { width, resize: "contain", quality: 70 } : undefined,
  });
  if (error || !data?.signedUrl) return notFound();

  // storage-js 의 download 옵션은 한글 파일명을 두 번 인코딩해서 %EC… 그대로 저장된다 → 직접 한 번만 인코딩
  const url = sp.get("download") === "1" && !thumb ? `${data.signedUrl}&download=${encodeURIComponent(row.file_name)}` : data.signedUrl;
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
