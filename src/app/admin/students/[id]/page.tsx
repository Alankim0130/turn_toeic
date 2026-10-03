import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAssignRole, isAdmin, isStaff, requireStaff, ROLE_LABEL, TEST_ROLES, type UserRole } from "@/lib/auth";
import { TestRoleSelect, type TestRoleOption } from "@/components/admin/students/TestRoleSelect";
import { todayKST, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TermChips } from "@/components/admin/TermChips";
import { RoleSelect, type RoleOption } from "@/components/admin/students/RoleSelect";
import { AssignSections, RemoveEnrollment } from "@/components/admin/students/EnrollmentEditor";
import { MergeAccounts, type MergeRequestRow, type StaffMergeCandidate } from "@/components/admin/students/MergeAccounts";
import { ProfileEditor } from "@/components/admin/students/ProfileEditor";
import { ProfilePhoto } from "@/components/layout/ProfilePhoto";
import { PhotoLightbox } from "@/components/layout/PhotoLightbox";
import { pickPhoto, safePhotoUrl } from "@/lib/avatar";
import { signedAvatarUrl } from "@/lib/avatar-url";
import { StudentReceipts, type StudentReceipt } from "@/components/admin/students/StudentReceipts";
import { receiptFacts, receiptNameMismatch, receiptVerdict } from "@/lib/receipt-history";
import type { PickerSection } from "@/components/admin/SectionPicker";
import { enrollmentLines, GENDER_LABEL, pickTerm, termLabel, TERM_COLUMNS } from "../../_lib/queries";
import { termParam } from "@/lib/study";

export const metadata: Metadata = { title: "학생 관리", robots: { index: false } };

/** 등급마다 한 줄 설명 — 고르기 전에 무엇이 달라지는지 알 수 있게 */
const ROLE_HINT: Record<UserRole, string> = {
  guest: "공개 페이지만 볼 수 있어요.",
  member: "가입 회원. 수강증을 올릴 수 있어요.",
  student: "배정된 반의 수강생전용을 종강일까지 쓸 수 있어요.",
  alumni: "종강한 학생. 수강생전용이 닫혀요.",
  instructor: "관리자 화면 전체를 쓸 수 있어요 — 권한은 관리자와 같습니다 (이혜영·이영수).",
  assistant: "학생 화면은 전부, 관리자 화면은 교재주문·스터디 신청자만 쓸 수 있어요.",
  admin: "관리자 화면 전체 + 다른 사람 등급 변경까지 할 수 있어요.",
};

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ term?: string }>;
}) {
  // 학생 관리는 강사·관리자만 — 개인정보 · 등급 · 반 배정이 모두 여기 있다 (2026-10-03 Alan "학생명단 · 반배정은 조교 권한 아님")
  const [{ id }, sp, { profile: me }] = await Promise.all([params, searchParams, requireStaff()]);
  const supabase = await createClient();
  const today = todayKST();

  const { data: student } = await supabase
    .from("profiles")
    .select("id, name, phone, role, test_role, university, department, gender, created_at, avatar_path")
    .eq("id", id)
    .maybeSingle();
  if (!student) notFound();

  const [{ data: enrollments }, { data: orders }, { data: terms }, { data: verifications }] = await Promise.all([
    supabase
      .from("enrollments")
      .select(
        "id, mode, status, order_id, section:class_sections!enrollments_section_id_fkey(id, term_id, course_id, track, start_time, end_time, time_block, closes_at, term:terms(year, month), course:courses(name))",
      )
      .eq("student_id", id)
      .order("id"),
    supabase.from("enrollment_orders").select("id, status, activates_on, access_until, verification_id").eq("user_id", id).order("activates_on", { ascending: false }),
    supabase.from("terms").select(TERM_COLUMNS).order("year").order("month"),
    // 올린 수강증 (2026-10-02 Alan) — 최근 것부터
    supabase
      .from("enrollment_verifications")
      .select("id, created_at, result, source, reject_reason, confidence, candidates, parsed, file_path, file_deleted_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // 수강증 그림 — 로그인한 사람의 세션으로 서명 URL (storage receipts 정책이 crew 에게 열려 있다). 지운 원본은 만들지 않는다
  const receiptPaths = (verifications ?? []).filter((v) => !v.file_deleted_at).map((v) => v.file_path);
  const { data: signedReceipts } = receiptPaths.length
    ? await supabase.storage.from("receipts").createSignedUrls(receiptPaths, 600)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const signedByPath = new Map((signedReceipts ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl]));
  const orderByVerification = new Map((orders ?? []).filter((o) => o.verification_id != null).map((o) => [o.verification_id as number, o.id]));
  const receipts: StudentReceipt[] = (verifications ?? []).map((v) => {
    const orderId = orderByVerification.get(v.id);
    const url = signedByPath.get(v.file_path);
    return {
      id: v.id,
      createdAt: v.created_at,
      manual: v.source === "manual",
      verdict: receiptVerdict(v),
      facts: receiptFacts(v.parsed),
      nameMismatch: receiptNameMismatch(v.parsed),
      // 그 수강증으로 만든 등록의 반 — 주5일은 한 줄 (짝은 그 등록 안에서만 찾는다)
      assigned: orderId == null ? [] : enrollmentLines((enrollments ?? []).filter((e) => e.order_id === orderId), { withEnd: true }).map((l) => l.label),
      image: url ? { url, isImage: /\.(png|jpe?g|webp|gif|heic)$/i.test(v.file_path) } : null,
      deleted: !!v.file_deleted_at,
    };
  });

  // 같은 사람으로 보이는 다른 계정 (이름 또는 전화번호가 같음). 판정·권한은 DB 함수가 본다.
  // **계정 합치기는 스태프만** — 기록을 통째로 옮기는 되돌리기 어려운 일이다. 이 화면이 2026-10-03 부터 강사·관리자 전용이라
  // 늘 참이지만 두 겹으로 둔다 (DB 함수도 스태프만 통과시킨다)
  const canMerge = isStaff(me.role);
  const { data: mergeCandidateRows } = canMerge
    ? await supabase.rpc("staff_merge_candidates", { p_user: id })
    : { data: null };
  const mergeCandidates = (mergeCandidateRows ?? []) as StaffMergeCandidate[];
  // 이 학생 계정의 로그인 방법·최근 로그인과, 열린 통합 요청 — 어느 계정이 실제로 쓰는 계정인지 보여 준다 (2026-10-02 Alan)
  const [{ data: authRows }, { data: openRequestRows }] = canMerge
    ? await Promise.all([
        supabase.rpc("student_auth_info", { p_ids: [id] }),
        supabase
          .from("account_merge_requests")
          .select("id, from_user, to_user, status, created_at")
          .in("status", ["pending", "choice"])
          .or(`from_user.eq.${id},to_user.eq.${id}`)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: null }, { data: null }];
  const studentLogin = authRows?.[0] ? { providers: authRows[0].providers ?? [], last_sign_in_at: authRows[0].last_sign_in_at ?? null } : null;
  const openMergeRequests = (openRequestRows ?? []) as MergeRequestRow[];
  // 프로필 사진 — 올린 사진이 있으면 그것, 없으면 카카오·구글 사진. 강사·관리자만 눌러서 크게 본다 (2026-10-02 Alan)
  const photo = pickPhoto(await signedAvatarUrl(supabase, student.avatar_path), safePhotoUrl(authRows?.[0]?.avatar_url));

  // 반 배정 추가의 기수 — **다음 수업이 남아 있는 기수**가 기본이다 (2026-10-02 Alan "9월달이 이미 종료가 되었고 10월달을 시작하기
  // 며칠전인데, 아직 9월달이 남아있는건 뭐지?"). 9월은 마지막 수업이 10/1 인데 종강일이 10/3 이라 "지금 기수"(개강일~종강일)로는
  // 10/3 까지 9월이 골라졌다. 종강일은 다시보기를 여는 날짜라 그대로 두고, 새로 배정하는 이 칸만 다음 수업으로 고른다.
  // 수업일을 못 읽으면(조회 실패) 예전처럼 "지금 기수".
  const { data: nextClass } = await supabase.from("term_class_dates").select("term_id").gte("date", today).order("date").limit(1).maybeSingle();
  const upcoming = (terms ?? []).find((t) => t.id === nextClass?.term_id) ?? null;
  const term = sp.term ? pickTerm(terms ?? [], sp.term, today) : (upcoming ?? pickTerm(terms ?? [], undefined, today));
  // 고른 기수의 수업이 다 끝났으면 칸 위에 말해 준다 — 그 달 반에 배정하면 종강일까지 다시보기만 열린다
  const { data: lastClass } = term
    ? await supabase.from("term_class_dates").select("date").eq("term_id", term.id).order("date", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const termFinished = !!lastClass && lastClass.date < today;
  const { data: termSections } = term
    ? await supabase
        .from("class_sections")
        .select("id, track, time_block, term:terms(year, month), course:courses(id, name, program, target_score)")
        .eq("term_id", term.id)
        .neq("status", "draft")
        .order("time_block")
        .order("track")
    : { data: [] };

  const takenIds = new Set((enrollments ?? []).map((e) => e.section?.id).filter(Boolean));
  // 반 배정 목록 — **주5일은 한 줄** (2026-10-02 Alan "반배정에서 주5일반을 고르면 2개반으로 표시가 되고 있어. 주5일반으로 하나로").
  // 짝은 이 학생의 배정 안에서만 찾고, 그 줄의 배정 해제는 두 반을 함께 지운다
  const lines = enrollmentLines(enrollments ?? [], { withEnd: true });
  const sectionOptions: PickerSection[] = (termSections ?? []).map((s) => ({ ...s, taken: takenIds.has(s.id) }));

  // 등급을 바꿀 수 있는지는 canAssignRole 한곳이 정한다 (강사·관리자)
  const roleOptions: RoleOption[] = canAssignRole(me.role)
    ? (Object.keys(ROLE_LABEL) as UserRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r], hint: ROLE_HINT[r] }))
    : [];
  const canChangeRole = roleOptions.length > 0;

  // 테스터: 강사·관리자 계정은 진짜 등급을 그대로 두고 테스트 등급으로 학생 화면을 확인한다 (2026-09-16 Alan)
  const tester = isStaff(student.role);
  const canSetTest = tester && (student.id === me.id || isAdmin(me.role));
  const TEST_HINT: Record<string, string> = {
    "": "진짜 등급으로 모든 화면을 봐요.",
    member: "가입만 한 회원처럼 보여요. 개강 전인 달의 반에 배정하면 예비등록생 화면이 나와요.",
    student: "배정된 반의 수강생전용만 열려요. 스파르타 반에 배정하면 함께 듣는 650·750·850 반도 열려요.",
    alumni: "종강한 학생처럼 수강생전용이 잠겨요.",
  };
  const testOptions: TestRoleOption[] = [
    { value: "", label: "테스트 안 함", hint: TEST_HINT[""] },
    ...TEST_ROLES.map((r) => ({ value: r, label: `${ROLE_LABEL[r]}으로 테스트`, hint: TEST_HINT[r] })),
  ];

  const info: { label: string; value: string }[] = [
    { label: "연락처", value: student.phone || "-" },
    { label: "대학", value: student.university || "-" },
    { label: "학과", value: student.department || "-" },
    { label: "성별", value: student.gender ? (GENDER_LABEL[student.gender] ?? student.gender) : "-" },
    { label: "가입일", value: formatDate(student.created_at, { year: "numeric", month: "long", day: "numeric" }) },
  ];

  return (
    <>
      <PageHeader icon="students" title={student.name || "이름 없음"} description="등급과 반 배정을 여기서 바꿉니다.">
        <Link href="/admin/students" className="btn-ghost !py-2">← 학생명단</Link>
      </PageHeader>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* 기본 정보 */}
        <section aria-labelledby="info-title" className="card p-5">
          <div className="mb-4 flex items-center gap-3">
            {isStaff(me.role) ? <PhotoLightbox src={photo} size={56} name={student.name} /> : <ProfilePhoto src={photo} size={56} />}
            <h2 id="info-title" className="text-lg font-black text-ink">기본 정보</h2>
          </div>
          <dl className="divide-y divide-line">
            {info.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <dt className="font-bold text-slate">{row.label}</dt>
                <dd className="min-w-0 truncate text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
          {/* 개인정보 수정 (2026-10-02 Alan) — 강사·관리자만 */}
          {isStaff(me.role) && (
            <ProfileEditor
              profile={{
                id: student.id,
                name: student.name,
                phone: student.phone,
                university: student.university,
                department: student.department,
                gender: student.gender,
              }}
            />
          )}
        </section>

        {/* 등급 */}
        <section aria-labelledby="role-title" className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <h2 id="role-title" className="text-lg font-black text-ink">등급</h2>
            <StatusBadge status={student.role} />
          </div>
          {canChangeRole ? (
            <RoleSelect id={student.id} current={student.role} options={roleOptions} />
          ) : (
            <p className="rounded-xl bg-brand-50/60 px-4 py-6 text-sm text-slate">
              등급은 <strong className="text-ink">강사·관리자</strong>만 바꿀 수 있어요. 바꿔야 하면 관리자에게 요청해 주세요.
            </p>
          )}
          <p className="mt-3 text-xs text-mist">
            등급을 올려도 반이 배정돼 있지 않으면 내 시간표·다시보기에는 아무것도 나오지 않아요. 아래에서 반을 함께 배정해 주세요.
          </p>
          {tester && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              테스터 계정이에요. 진짜 등급을 학생으로 내리면 관리자 화면을 잃어요 — 테스트는 아래 <b>테스트 등급</b>으로 하세요.
            </p>
          )}
        </section>

        {/* 올린 수강증 (2026-10-02 Alan "학생이 직접올린 수강증을 볼 수 있으면") — 판정 · 승인은 등업 검토 화면에서 */}
        <section aria-labelledby="receipts-title" className="card p-5 lg:col-span-2">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 id="receipts-title" className="text-lg font-black text-ink">
              올린 수강증 <span className="tabular-nums text-slate">({receipts.length})</span>
            </h2>
            {receipts.length > 0 && <span className="text-xs text-mist">그림을 누르면 크게 · 승인 · 반려 · 반 고치기는 등업 검토 화면에서</span>}
          </div>
          <p className="mb-4 text-sm text-slate">학생이 등업신청에서 올린 수강증이에요. 최근 것부터, 결과와 수강증에서 읽은 값 · 배정된 반을 함께 보여 줘요.</p>
          <StudentReceipts receipts={receipts} />
        </section>

        {/* 계정 합치기 (2026-09-18 Alan 요청) — 학생이 계정을 여러 개 만들었을 때 강사가 직접 합친다. 스태프만 */}
        {canMerge && (
        <section aria-labelledby="merge-title" className="card p-5 lg:col-span-2">
          <h2 id="merge-title" className="text-lg font-black text-ink">계정 합치기</h2>
          <p className="mt-1 text-sm text-slate">
            이름이나 전화번호가 같은 다른 계정입니다. 같은 사람이면 하나로 합쳐 숙제·수강 기록을 한곳에 모읍니다.
          </p>
          <MergeAccounts
            student={{ id: student.id, name: student.name }}
            studentLogin={studentLogin}
            candidates={mergeCandidates}
            requests={openMergeRequests}
            today={today}
          />
        </section>
        )}

        {/* 테스터: 테스트 등급 */}
        {tester && (
          <section aria-labelledby="tester-title" className="card border-amber-200 p-5 lg:col-span-2">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-black text-amber-800">테스터</span>
              <h2 id="tester-title" className="text-lg font-black text-ink">테스트 등급</h2>
              {student.test_role && (
                <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-black text-white">지금 {ROLE_LABEL[student.test_role]}으로 테스트 중</span>
              )}
            </div>
            <p className="mb-4 text-sm text-slate">
              진짜 등급({ROLE_LABEL[student.role]})은 그대로 두고, 학생 화면과 데이터 권한을 이 등급의 학생처럼 바꿔요.
              아래 <b>반 배정</b>으로 반을 붙이면 그 반 학생이 보는 화면 그대로 확인할 수 있습니다.
              테스트 중에는 모든 화면 위에 <b>테스트 끝내기</b> 띠가 뜨고, 관리자 화면의 데이터는 끝낸 뒤에 다시 보여요.
            </p>
            {canSetTest ? (
              <TestRoleSelect id={student.id} current={student.test_role ?? ""} options={testOptions} />
            ) : (
              <p className="rounded-xl bg-brand-50/60 px-4 py-4 text-sm text-slate">다른 사람의 테스트 등급은 관리자만 바꿀 수 있어요.</p>
            )}
          </section>
        )}

        {/* 반 배정 */}
        <section aria-labelledby="enroll-title" className="card p-5 lg:col-span-2">
          <h2 id="enroll-title" className="mb-4 text-lg font-black text-ink">
            반 배정 <span className="tabular-nums text-slate">({lines.length})</span>
          </h2>

          {lines.length === 0 ? (
            <p className="rounded-xl bg-brand-50/60 px-4 py-6 text-center text-sm text-slate">아직 배정된 반이 없어요.</p>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.key} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-bold text-ink">{l.label}</span>
                    {l.closesAt && <span className="ml-2 text-xs text-slate">{formatDate(l.closesAt, { month: "long", day: "numeric" })} 종강</span>}
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    {l.statuses.map((st) => (
                      <StatusBadge key={st} status={st} />
                    ))}
                    <RemoveEnrollment enrollmentIds={l.ids} label={l.label} week5={l.week5} />
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 border-t border-line pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-black text-ink">반 배정 추가</h3>
              <p className="text-xs text-slate">주5일은 [주5일] 버튼으로 월수금·화목금이 함께 골라져요. 60분 반은 시간대 아래 ↳ 줄에서 고르세요</p>
            </div>
            {(terms ?? []).length === 0 ? (
              <p className="rounded-xl bg-brand-50/60 px-4 py-6 text-center text-sm text-slate">
                개설된 기수가 없어요. <Link href="/admin/sections" className="font-bold text-brand-600 hover:underline">반 편성으로 이동</Link>
              </p>
            ) : (
              <>
                <TermChips basePath={`/admin/students/${student.id}`} terms={terms ?? []} current={term ? termParam(term.year, term.month) : null} />
                {term && termFinished && lastClass && (
                  <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    {termLabel(term)} 기수는 수업이 다 끝났어요 (마지막 수업 {formatDate(lastClass.date, { month: "long", day: "numeric" })}
                    {term.closes_at ? ` · 종강 ${formatDate(term.closes_at, { month: "long", day: "numeric" })}` : ""}). 이 달 반에 배정하면 종강일까지 다시보기만 열려요 —
                    새로 오는 학생은 {upcoming && upcoming.id !== term.id ? `${termLabel(upcoming, true)} ` : "다음 "}기수에 배정해 주세요.
                  </p>
                )}
                <AssignSections id={student.id} sections={sectionOptions} />
              </>
            )}
          </div>

          {(orders ?? []).length > 0 && (
            <details className="mt-6 border-t border-line pt-4">
              <summary className="cursor-pointer text-sm font-bold text-slate">등록 이력 {(orders ?? []).length}건</summary>
              <ul className="mt-2 divide-y divide-line text-sm">
                {(orders ?? []).map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-ink">
                      {formatDate(o.activates_on, { month: "long", day: "numeric" })} 개강 · {formatDate(o.access_until, { month: "long", day: "numeric" })} 만료
                    </span>
                    <span className="flex items-center gap-2">
                      {!o.verification_id && <span className="chip text-xs">스태프 배정</span>}
                      <StatusBadge status={o.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>

      <p className="mt-6 text-xs text-mist">
        {term ? `${termLabel(term)} 기수 반을 보여 주고 있어요.` : ""} 반 배정을 바꾸면 그 학생의 내 시간표·다시보기·수강생전용이 바로 따라 바뀝니다.
      </p>
    </>
  );
}
