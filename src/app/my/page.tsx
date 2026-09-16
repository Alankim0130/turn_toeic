import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { InstallApp } from "@/components/pwa/InstallApp";
import { effectiveRole, getStudentAccess, requireUser, ROLE_LABEL } from "@/lib/auth";
import { cn, formatDate, formatTimeRange, MODE_LABEL, TRACK_LABEL } from "@/lib/utils";
import {
  getMyOrders,
  getMyVerifications,
  monthOf,
  ORDER_STATUS_LABEL,
  termLabel,
  VERIFICATION_STATUS_LABEL,
} from "./_lib/queries";

export const metadata: Metadata = {
  title: "마이페이지",
  robots: { index: false },
};

const QUICK: { href: string; label: string; desc: string; icon: IconName }[] = [
  { href: "/my/verify", label: "등업신청", desc: "수강증 올리기", icon: "verify" },
  { href: "/my/class", label: "내 시간표", desc: "수업일 확인", icon: "calendar" },
  { href: "/my/lecture", label: "특강신청", desc: "특강·모의고사", icon: "bolt" },
  { href: "/my/live", label: "불라방", desc: "실시간 입장", icon: "live" },
  { href: "/my/textbook", label: "교재주문", desc: "불라방 교재 배송", icon: "textbook" },
  { href: "/my/replay", label: "다시보기", desc: "종강일까지 시청", icon: "replay" },
  { href: "/my/study", label: "내 스터디", desc: "신청 · 비대면 자료", icon: "study" },
  { href: "/my/homework", label: "숙제업로드", desc: "풀이 사진 올리기", icon: "homework" },
  { href: "/my/lc-audio", label: "LC음원듣기", desc: "레벨별 음원", icon: "headphones" },
];

export default async function MyPage({ searchParams }: { searchParams: Promise<{ welcome?: string; denied?: string }> }) {
  const [{ profile, user }, sp, orders, verifications, access] = await Promise.all([
    requireUser("/my"),
    searchParams,
    getMyOrders(),
    getMyVerifications(),
    getStudentAccess(),
  ]);

  const name = profile?.name || user.email || "회원";
  // 테스터가 테스트 등급을 켜 두었으면 그 등급으로 보여 준다
  const role = effectiveRole(profile) ?? "member";
  const latestVerification = verifications[0];
  const empty = orders.length === 0 && verifications.length === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate">반갑습니다</p>
          <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
            {name}
            <span className="text-slate"> 님</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <span className="chip">
            <Icon name="profile" size={16} />
            {ROLE_LABEL[role]}
          </span>
          {/* 수강생전용은 강사가 정한 종강일까지 쓸 수 있다 */}
          {access.until && (
            <span className="chip">
              <Icon name="calendar" size={16} />
              {formatDate(access.until, { month: "numeric", day: "numeric" })} 종강까지 이용
            </span>
          )}
        </div>
      </header>

      {sp.welcome === "1" && (
        <Alert kind="success" title="가입이 완료됐어요">
          수강증을 올리면 수강생으로 자동 등업되고, 불라방과 다시보기가 열립니다.
        </Alert>
      )}
      {sp.denied === "admin" && (
        <Alert kind="warning" title="관리자 페이지에 접근할 수 없어요">
          강사 또는 관리자 계정으로만 이용할 수 있습니다.
        </Alert>
      )}

      {/* 휴대폰에서 아직 홈 화면 앱으로 설치하지 않았을 때만 보인다 */}
      <InstallApp variant="card" />

      {empty ? (
        <EmptyState
          icon="verify"
          title="아직 등록 내역이 없어요"
          description="YBM 공식 사이트에서 수강 신청 후 받은 수강증을 올리면 수강생으로 자동 등업됩니다."
          action={{ href: "/my/verify", label: "수강증 올리고 등업하기" }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* 내 등록 현황 */}
          <Reveal>
            <section aria-labelledby="orders-title" className="card p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 id="orders-title" className="text-lg font-black text-ink">내 등록 현황</h2>
                <Link href="/my/class" className="text-sm font-bold text-brand-600 hover:underline">
                  시간표 보기 →
                </Link>
              </div>

              {orders.length === 0 ? (
                <p className="mt-4 text-sm text-slate">아직 배정된 반이 없어요. 등업신청이 승인되면 여기에 표시됩니다.</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {orders.map((o) => {
                    const preliminary = o.status === "preliminary";
                    return (
                      <li
                        key={o.id}
                        className={cn(
                          "rounded-xl2 border p-4",
                          preliminary ? "border-brand-300 bg-brand-50" : o.status === "expired" ? "border-line bg-surface opacity-70" : "border-line bg-paper",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-xs font-black",
                              o.status === "active" ? "bg-brand-500 text-white" : preliminary ? "bg-ink text-white" : "bg-line text-slate",
                            )}
                          >
                            {ORDER_STATUS_LABEL[o.status] ?? o.status}
                          </span>
                          <span className="ml-auto text-xs text-mist">
                            {o.status === "expired" ? "시청 종료" : "다시보기 시청 가능"}: {formatDate(o.access_until, { month: "long", day: "numeric" })}까지
                          </span>
                        </div>

                        {preliminary && (
                          <div className="mt-3 flex items-start gap-3 rounded-xl bg-paper p-3">
                            <Icon name="rank1" size={28} />
                            <div className="text-sm">
                              <p className="font-black text-brand-700">{monthOf(o.activates_on)}월 예비등록생</p>
                              <p className="text-slate">
                                개강일 {formatDate(o.activates_on)}부터 불라방과 다시보기가 자동으로 열립니다.
                              </p>
                            </div>
                          </div>
                        )}

                        <ul className="mt-3 space-y-2">
                          {o.enrollments.map((e) =>
                            e.section ? (
                              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                <span className="font-black text-ink">{termLabel(e.section.term)}</span>
                                <span className="font-semibold text-ink">{e.section.course?.name ?? "강좌"}</span>
                                <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-white">
                                  {TRACK_LABEL[e.section.track] ?? e.section.track}
                                </span>
                                {e.section.start_time && e.section.end_time ? (
                                  <span className="text-slate">{formatTimeRange(e.section.start_time, e.section.end_time)}</span>
                                ) : (
                                  e.section.time_block && <span className="tabular-nums text-slate">{e.section.time_block}</span>
                                )}
                                <span className={cn("text-xs font-bold", e.mode === "live" ? "text-brand-600" : "text-slate")}>
                                  {MODE_LABEL[e.mode]}
                                </span>
                              </li>
                            ) : null,
                          )}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </Reveal>

          {/* 등업신청 현황 */}
          <Reveal delay={90}>
            <section aria-labelledby="verify-title" className="card p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 id="verify-title" className="text-lg font-black text-ink">등업신청 현황</h2>
                <Link href="/my/verify" className="text-sm font-bold text-brand-600 hover:underline">
                  신청하기 →
                </Link>
              </div>
              {!latestVerification ? (
                <p className="mt-4 text-sm text-slate">아직 올린 수강증이 없어요.</p>
              ) : (
                <div className="mt-4 flex items-start gap-3">
                  <Icon name={latestVerification.result === "rejected" ? "warning" : latestVerification.result === "approved" ? "success" : "upload"} size={32} />
                  <div className="text-sm">
                    <p className="font-black text-ink">{VERIFICATION_STATUS_LABEL(latestVerification.result)}</p>
                    <p className="text-slate">{formatDate(latestVerification.created_at, { year: "numeric", month: "long", day: "numeric" })} 접수</p>
                    {latestVerification.result === null && <p className="mt-1 text-slate">확인 후 자동으로 등업됩니다. 보통 1일 이내 처리돼요.</p>}
                    {latestVerification.result === "rejected" && latestVerification.reject_reason && (
                      <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-amber-800">사유: {latestVerification.reject_reason}</p>
                    )}
                  </div>
                </div>
              )}
            </section>
          </Reveal>
        </div>
      )}

      {/* 바로가기 */}
      <Reveal delay={140}>
        <section aria-labelledby="quick-title">
          <h2 id="quick-title" className="mb-3 text-lg font-black text-ink">바로가기</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {QUICK.map((q) => (
              <li key={q.href}>
                <Link href={q.href} className="card flex h-full flex-col items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-pink">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50">
                    <Icon name={q.icon} size={28} />
                  </span>
                  <span>
                    <span className="block font-black text-ink">{q.label}</span>
                    <span className="block text-xs text-slate">{q.desc}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </Reveal>
    </div>
  );
}
