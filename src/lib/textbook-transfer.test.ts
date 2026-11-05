import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { crewCanConfirm, isTransferImageType, transferAttachError, transferFileProblem, transferPath, transferUploadProblem, TRANSFER_BUCKET, TRANSFER_MAX_MB, TRANSFER_REQUIRED } from "./textbook-transfer";
import { orderHint } from "./textbook";
import { MB } from "./upload";

/**
 * 교재주문 이체 화면 캡처 (2026-11-04 Alan — "학생이 이체를 하고 난 뒤에, 해당 화면을 스크린샷찍어서 올려주면 조교들이 바로 확인하고 배송을 시작").
 * 조교의 금액확인은 **캡처가 있는 주문만** — 화면 · 서버 액션 · DB 트리거 셋이 같은 규칙이어야 한다.
 */
const read = (p: string) => readFileSync(p, "utf8");
const sql = read("supabase/migrations/20261104100000_textbook_transfer_shot.sql");
const UID = "00000000-0000-0000-0000-000000000001";

describe("마이그레이션 — 학생은 함수로만 붙이고, 캡처가 있는 주문은 조교도 금액확인", () => {
  it("칸 다섯 + check(경로 · 올린 시각 · 10MB) — 수강증(receipt)과 다른 이름", () => {
    for (const col of ["transfer_path", "transfer_type", "transfer_size", "transfer_name", "transfer_at"]) expect(sql).toContain(`add column if not exists ${col}`);
    expect(sql).toContain("transfer_size <= 10 * 1024 * 1024");
    expect(sql).not.toMatch(/receipt_|_receipt/);
  });

  it("attach_textbook_transfer — security definer · search_path '' · auth.uid() · 내 폴더 한 단계 · 사진 형식 · requested 만 · 비회원 실행 불가", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.attach_textbook_transfer"), sql.indexOf("-- ─── 조교의 금액확인"));
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = ''");
    expect(fn).toContain("v_uid uuid := (select auth.uid())");
    expect(fn).toContain("'^' || v_uid::text || '/[A-Za-z0-9._-]{1,80}$'");
    expect(fn).toContain("'^image/(jpeg|jpg|png|webp|gif|heic|heif|avif|bmp|tiff)$'");
    expect(fn).toContain("where o.id = p_id and o.user_id = v_uid");
    expect(fn).toContain("if v_status <> 'requested' then");
    expect(fn).toContain("return v_old;");
    expect(sql).toContain("revoke all on function public.attach_textbook_transfer(bigint, text, text, integer, text) from public, anon;");
    expect(sql).toContain("grant execute on function public.attach_textbook_transfer(bigint, text, text, integer, text) to authenticated;");
  });

  it("트리거 — 조교는 상태 · 송장만(캡처 칸 못 바꿈), requested → confirmed 는 old.transfer_path 가 있을 때만, shipped 건너뛰기는 그대로 막는다", () => {
    const trg = sql.slice(sql.indexOf("create or replace function private.guard_textbook_order_update"), sql.indexOf("-- ─── 버킷"));
    expect(trg).toContain("(to_jsonb(new) - array['status', 'tracking_no', 'updated_at', 'received_at'])");
    expect(trg).toContain("raise exception 'assistant_status_only'");
    expect(trg).toContain("if new.status in ('confirmed', 'shipped') and old.status in ('requested', 'cancelled')");
    expect(trg).toContain("and not (new.status = 'confirmed' and old.status = 'requested' and old.transfer_path is not null) then");
    expect(trg).toContain("raise exception 'confirm_staff_only'");
    expect(trg).toContain("new.received_at := null;");
  });

  it("버킷 — 비공개 · 사진 형식 · 10MB, 본인 폴더 올리기 · 본인 삭제, 조회는 조교 확인이 맨 앞", () => {
    expect(sql).toContain(`'${TRANSFER_BUCKET}', '${TRANSFER_BUCKET}', false, ${TRANSFER_MAX_MB} * 1024 * 1024`);
    expect(sql).toContain("array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif', 'image/bmp', 'image/tiff']");
    expect(sql).toMatch(/for insert to authenticated\s+with check \(bucket_id = 'textbook-transfers' and \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text\)/);
    expect(sql).toMatch(/for select to authenticated\s+using \(bucket_id = 'textbook-transfers' and \(\(select private\.is_crew\(\)\) or \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text\)\)/);
    expect(sql).toMatch(/for delete to authenticated\s+using \(bucket_id = 'textbook-transfers' and \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text\)/);
    // 정책 이름은 63바이트 안
    for (const m of sql.matchAll(/create policy "([^"]+)"/g)) expect(Buffer.byteLength(m[1]), m[1]).toBeLessThanOrEqual(63);
  });
});

describe("서버 액션 · 파일 라우트", () => {
  it("관리자 금액확인 — requireCrew 로 받되 조교면 transfer_path is not null 을 건다. 조교의 상태 직접 바꾸기도 같은 조건", () => {
    const actions = read("src/app/admin/textbook-orders/actions.ts");
    const confirm = actions.slice(actions.indexOf("export async function confirmTextbookPayment"), actions.indexOf("export async function markTextbookShipped"));
    expect(confirm).toMatch(/^\s*const \{ profile \} = await requireCrew\(\);/m);
    expect(confirm).toContain('if (!staff) query = query.not("transfer_path", "is", null);');
    expect(confirm).toContain('if (!data || data.length === 0) go(back, staff ? "error=stale" : "error=transfer");');
    expect(confirm).toContain('error.message.includes("confirm_staff_only") ? "error=transfer"');
    const update = actions.slice(actions.indexOf("export async function updateTextbookOrder"));
    expect(update).toContain('const confirmable = status === "confirmed" && current?.status === "requested" && !!current.transfer_path;');
    expect(actions).not.toMatch(/service|createAdminClient/i);
  });

  it("학생 서버 액션 — 내 폴더 · 사진 · 10MB 를 본 뒤 파일이 진짜 있는지 보고 DB 함수로만 붙인다. 못 붙이면 파일을 지운다", () => {
    const actions = read("src/app/my/textbook/actions.ts");
    const attach = actions.slice(actions.indexOf("export async function attachTextbookTransfer"));
    expect(attach).toContain("transferUploadProblem(user.id, file)");
    expect(attach).toContain("supabase.storage.from(TRANSFER_BUCKET).list(user.id, { search: name, limit: 5 })");
    expect(attach).toContain('supabase.rpc("attach_textbook_transfer"');
    expect(attach).toContain("if (previous && previous !== file.path) await supabase.storage.from(TRANSFER_BUCKET).remove([previous]);");
    expect(attach).toContain('notifyStaff("textbook_order"');
    const submit = actions.slice(actions.indexOf("export async function submitTextbookOrder"), actions.indexOf("export type TransferResult"));
    // 2026-11-05 Alan "스크린샷을 올려야지 주문이 완료되도록" — 캡처 없는 주문은 폼 · 서버 액션 둘 다 받지 않는다
    expect(submit).toContain("if (!transfer) return { error: TRANSFER_REQUIRED, values };");
    expect(read("src/app/my/textbook/TextbookForm.tsx")).toMatch(/: !transfer\s*\? TRANSFER_REQUIRED\s*: null;/);
    expect(read("src/app/my/textbook/TransferPicker.tsx")).toContain("(필수)");
    expect(TRANSFER_REQUIRED).toContain("올려야 주문이 완료");
    expect(submit).toContain("transferUploadProblem(user.id, transfer)");
    expect(submit).toContain("if (attachError) await supabase.storage.from(TRANSFER_BUCKET).remove([transfer.path]);");
    // 주문 폼은 파일 칸에 name 이 없다 — 폼 데이터에 파일이 실리지 않는다 (서버 액션 본문 한도 1MB)
    const picker = read("src/app/my/textbook/TransferPicker.tsx");
    expect(picker).toMatch(/<input ref=\{inputRef\} type="file" accept="image\/\*"/);
    expect(picker).not.toMatch(/<input[^>]*name=/);
    const form = read("src/app/my/textbook/TextbookForm.tsx");
    expect(form).toContain('formData.set("transfer_path", up.path);');
    expect(form).toContain("startTransition(() => action(formData));");
  });

  it("/files/transfer/{주문 id} — textbook_orders 행을 사용자 세션으로 읽고 썸네일을 준다", () => {
    const route = read("src/app/files/[kind]/[id]/route.ts");
    expect(route).toContain('transfer: "textbook-transfers",');
    expect(route).toContain('supabase.from("textbook_orders").select("file_path:transfer_path, file_name:transfer_name, content_type:transfer_type").eq("id", id).maybeSingle()');
    expect(route).toMatch(/kind === "transfer"\) && isImageType\(row\.content_type\)/);
  });

  it("학생 내역 조회가 캡처 칸을 읽고, 카드는 금액확인 전에만 올리기 버튼을 그린다", () => {
    expect(read("src/app/my/_lib/queries.ts")).toContain("transfer_path, transfer_at,");
    const page = read("src/app/my/textbook/page.tsx");
    expect(page).toContain('{o.status === "requested" && <TransferUpload orderId={o.id} userId={user.id} has={!!o.transfer_path} />}');
    expect(page).toContain("`/files/transfer/${o.id}?w=400`");
  });
});

describe("작은 규칙", () => {
  it("사진 형식 — DB 함수 · 버킷과 같은 목록, SVG 는 아니다", () => {
    expect(isTransferImageType("image/png")).toBe(true);
    expect(isTransferImageType("image/heic")).toBe(true);
    expect(isTransferImageType("image/svg+xml")).toBe(false);
    expect(isTransferImageType("application/pdf")).toBe(false);
  });

  it("고른 파일 — 사진만 · 10MB 이하 · 빈 파일 아님", () => {
    expect(transferFileProblem({ name: "a.png", type: "image/png", size: 100 })).toBeNull();
    expect(transferFileProblem({ name: "a.PNG", type: "", size: 100 })).toBeNull();
    expect(transferFileProblem({ name: "a.pdf", type: "application/pdf", size: 100 })).toContain("사진 파일");
    expect(transferFileProblem({ name: "a.png", type: "image/png", size: 0 })).toContain("빈 파일");
    expect(transferFileProblem({ name: "a.png", type: "image/png", size: TRANSFER_MAX_MB * MB + 1 })).toContain("10MB");
  });

  it("서버가 받은 경로 — 내 폴더 바로 아래 한 단계만", () => {
    const ok = { path: `${UID}/abc.png`, name: "a.png", type: "image/png", size: 10 };
    expect(transferUploadProblem(UID, ok)).toBeNull();
    expect(transferUploadProblem(UID, { ...ok, path: `other/abc.png` })).toContain("경로");
    expect(transferUploadProblem(UID, { ...ok, path: `${UID}/sub/abc.png` })).toContain("경로");
    expect(transferUploadProblem(UID, { ...ok, path: `${UID}/../abc.png` })).toContain("경로");
    expect(transferUploadProblem(UID, { ...ok, path: `${UID}/` })).toContain("경로");
    expect(transferUploadProblem(UID, { ...ok, type: "image/svg+xml" })).toContain("사진 파일");
    expect(transferUploadProblem(UID, null)).toContain("경로");
    expect(transferPath(UID, { name: "캡처.png" })).toMatch(new RegExp(`^${UID}/[0-9a-f-]{36}\\.png$`));
  });

  it("조교 금액확인 조건 = 금액확인 전 + 캡처 (DB 트리거와 같다)", () => {
    expect(crewCanConfirm({ status: "requested", transfer_path: "x/y.png" })).toBe(true);
    expect(crewCanConfirm({ status: "requested", transfer_path: null })).toBe(false);
    expect(crewCanConfirm({ status: "confirmed", transfer_path: "x/y.png" })).toBe(false);
  });

  it("DB 거절 → 학생에게 보일 말", () => {
    expect(transferAttachError("not_requested")).toContain("금액확인이 끝난");
    expect(transferAttachError("P0002 not_found")).toContain("주문을 찾을 수 없어요");
    expect(transferAttachError("bad_type")).toContain("사진 파일");
    expect(transferAttachError(undefined)).toContain("올리지 못했어요");
  });

  it("학생 카드 안내 — 캡처를 올린 금액확인 전 주문은 '캡처를 보고 금액을 확인해요'", () => {
    expect(orderHint({ status: "requested", transfer_path: "x/y.png" })).toContain("캡처를 보고");
    expect(orderHint({ status: "requested", transfer_path: null })).toContain("캡처를 올려 주세요");
    expect(orderHint({ status: "confirmed", transfer_path: "x/y.png" })).toContain("금액이 확인됐어요");
    expect(orderHint({ status: "requested", delivery_method: "pickup", transfer_path: "x/y.png" })).toContain("캡처를 보고");
  });
});
