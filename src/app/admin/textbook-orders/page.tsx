import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayKST, TRACK_LABEL } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { PushSetup } from "@/components/push/PushSetup";
import { orderClassLines, termLabel } from "../_lib/queries";
import { getProfileNames } from "../_lib/profile-names";
import { isStaff, requireCrew } from "@/lib/auth";
import { TEXTBOOK_ADMIN_STATUS } from "@/lib/textbook";
import { isTextbookAccountMissing } from "@/lib/textbook-guide";
import { trackingKey, type UsedTracking } from "@/lib/tracking-label";
import { OrderList, type OrderEntry } from "@/components/admin/textbook-orders/OrderList";
import type { OrderClassLine } from "@/components/admin/textbook-orders/OrderParts";
import { PickupSchedule } from "@/components/admin/textbook-orders/PickupSchedule";

export const metadata: Metadata = { title: "교재주문", robots: { index: false } };

// 배송 단계 (2026-10-02 Alan): 강사가 금액확인 → 조교가 배송완료. 이름은 하는 일 — 학생 화면은 같은 상태를 배송확인 · 배송시작으로 부른다
const TABS = [
  { value: "requested", label: TEXTBOOK_ADMIN_STATUS.requested },
  { value: "confirmed", label: TEXTBOOK_ADMIN_STATUS.confirmed },
  { value: "shipped", label: TEXTBOOK_ADMIN_STATUS.shipped },
  { value: "cancelled", label: TEXTBOOK_ADMIN_STATUS.cancelled },
  { value: "all", label: "전체" },
];

const ERROR_TEXT: Record<string, string> = {
  invalid: "잘못된 요청입니다.",
  stale: "이미 처리됐거나 학생이 취소한 주문이에요. 목록을 다시 확인해 주세요.",
  staff: "금액확인은 강사·관리자만 할 수 있어요 — 교재비가 강사님 통장으로 들어와요.",
};

export default async function TextbookOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ok?: string; did?: string; error?: string; open?: string }>;
}) {
  // 조교에게도 열린 화면이다 (2026-09-16 Alan). 레이아웃이 조교를 통과시키므로 화면마다 가드를 둔다
  const { profile } = await requireCrew();
  const staff = isStaff(profile.role);
  const { status: statusParam, ok, did, error, open: openParam } = await searchParams;
  // 휴대폰 카드를 열어 둔 채 보여 줄 주문 — 현장수령 예정에서 눌러 왔을 때 (OrderCard)
  const openId = Number(openParam) || null;
  // 처음 열면 할 일부터 — 강사·관리자는 금액확인 전, 조교는 배송 대기
  const status = TABS.some((t) => t.value === statusParam) ? (statusParam as string) : staff ? "requested" : "confirmed";
  const supabase = await createClient();

  let query = supabase
    .from("textbook_orders")
    .select("*, section:class_sections(track, time_block, course:courses(name), term:terms(year, month))")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status !== "all") query = query.eq("status", status);

  const [{ data: rows }, { data: pickups }, accountMissing, { data: trackedRows }, ...countRes] = await Promise.all([
    query,
    // 현장수령 예정 (2026-10-07) — 아직 건네지 않은 것(금액확인 전 · 수령 대기)을 받으러 올 날짜 · 시각 순으로. 탭과 상관없이 맨 위에 선다
    supabase
      .from("textbook_orders")
      .select("id, recipient_name, status, pickup_date, pickup_time")
      .eq("delivery_method", "pickup")
      .in("status", ["requested", "confirmed"])
      .order("pickup_date", { ascending: true })
      .order("pickup_time", { ascending: true })
      .limit(50),
    // 입금 계좌가 없어 학생이 주문하지 못하는가 (2026-10-07) — 그동안은 주문이 안 들어와 이 화면이 빈 채로 조용했다
    isTextbookAccountMissing(supabase),
    // 이미 들어간 운송장번호 (2026-10-27) — 송장 칸에 넣은(사진으로 읽은) 번호가 다른 주문에 있으면 알려 준다. 탭과 상관없이 최근 것
    supabase
      .from("textbook_orders")
      .select("id, tracking_no, recipient_name")
      .not("tracking_no", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1000),
    ...["requested", "confirmed", "shipped", "cancelled"].map((s) => supabase.from("textbook_orders").select("id", { count: "exact", head: true }).eq("status", s)),
  ]);
  const today = todayKST();
  // 한 번 만들어 모든 줄에 같은 목록을 넘긴다 — 화면 데이터에는 한 번만 실린다
  const usedTracking: UsedTracking[] = (trackedRows ?? []).flatMap((r) => {
    const key = trackingKey(r.tracking_no);
    return key ? [{ id: r.id, key, name: r.recipient_name }] : [];
  });
  // 주문의 반 — 주문할 때 적어 둔 그 달 불라방 반 전부 (2026-10-27 Alan "750 주5일 60분이야. 근데 교재신청에는 월수금으로").
  // 그 칸이 비어 있으면(마이그레이션 전 · 배포 사이) 대표 반 하나
  const classIdsOf = (o: { section_id: number; section_ids?: number[] | null }) => (o.section_ids?.length ? o.section_ids : [o.section_id]);
  const classIds = [...new Set((rows ?? []).flatMap(classIdsOf))];
  // 주문한 학생의 가입 이름 — 이름 · 등급만 주는 함수로 (조교는 profiles 를 못 읽는다, 2026-10-03 `profile-names.ts`).
  // 배송에 쓰는 받는 사람 · 연락처 · 주소는 주문에 따로 적혀 있다 (Alan — 교재 배송은 번호가 필요하다)
  const [names, { data: classRows }] = await Promise.all([
    getProfileNames(supabase, (rows ?? []).map((o) => o.user_id)),
    classIds.length > 0
      ? supabase
          .from("class_sections")
          .select("id, term_id, course_id, track, time_block, start_time, subject, course:courses(name, target_score, program, course_type), term:terms(year, month)")
          .in("id", classIds)
      : Promise.resolve({ data: [] }),
  ]);
  const classById = new Map((classRows ?? []).map((s) => [s.id, s]));
  // 반을 다 읽지 못하면 줄을 만들지 않는다 — 대표 반으로 대신 적는다 (한 트랙만 읽혀 주5일이 월수금으로 보이지 않게)
  const classLinesOf = (o: { section_id: number; section_ids?: number[] | null }): OrderClassLine[] | null => {
    const found = classIdsOf(o).flatMap((id) => classById.get(id) ?? []);
    return found.length === classIdsOf(o).length ? orderClassLines(found) : null;
  };
  /** 반을 다 읽지 못했을 때 — 주문의 대표 반 두 줄 */
  const classFallbackOf = (o: NonNullable<typeof rows>[number]): [string, string] => [
    `${termLabel(o.section?.term, true)} · ${o.section?.course?.name ?? "강좌"}`,
    `${o.section?.track ? TRACK_LABEL[o.section.track] : ""} ${o.section?.time_block ?? ""}`,
  ];
  // 표 · 휴대폰 카드가 같이 그리는 한 건 — 가입 이름 · 반은 여기서 한 번 만든다
  const orders: OrderEntry[] = (rows ?? []).map((o) => ({
    order: o,
    student: names.get(o.user_id)?.name ?? "-",
    classLines: classLinesOf(o),
    classFallback: classFallbackOf(o),
  }));
  const counts: Record<string, number | undefined> = {
    requested: countRes[0].count ?? 0,
    confirmed: countRes[1].count ?? 0,
    shipped: countRes[2].count ?? 0,
    cancelled: countRes[3].count ?? 0,
  };
  const back = `/admin/textbook-orders?status=${status}`;

  return (
    <>
      <PageHeader
        icon="orders"
        title="교재주문"
        description="불라방 수강생의 교재 주문이에요. 강사님이 입금자명을 통장과 대조해 '금액확인'을 누르면 조교 화면의 배송 대기로 넘어가고, 보낸 뒤 '배송완료'를 누르면 학생 화면에 배송시작으로 보여요. 현장수령 주문은 학생이 고른 날짜 · 시각에 학원에서 건네고 '수령완료'를 눌러요."
      />
      {staff && (
        <div className="mb-4 flex justify-end">
          <Link href="/admin/textbook-orders/setup" className="btn-secondary !py-2 text-sm">
            <Icon name="textbook" size={18} />
            교재·입금 계좌 설정
          </Link>
        </div>
      )}
      {ok && (
        <Alert kind="success" className="mb-4">
          {did === "confirmed"
            ? `주문 #${ok} 금액확인했어요 — 조교 화면의 배송 대기로 넘어갔고, 학생 화면에는 배송확인(현장수령이면 입금확인)으로 보여요.`
            : did === "shipped"
              ? `주문 #${ok} 배송완료 — 학생 화면에 배송시작으로 보여요.`
              : did === "picked"
                ? `주문 #${ok} 수령완료 — 학원에서 건넸어요. 학생 주문 내역에서는 사라져요.`
                : `주문 #${ok} 상태를 저장했습니다.`}
        </Alert>
      )}
      {error && <Alert kind="warning" className="mb-4">{ERROR_TEXT[error] ?? "저장에 실패했습니다. 다시 시도해 주세요."}</Alert>}
      {accountMissing && (
        <Alert kind="warning" title="입금 계좌가 없어 불라방 학생이 교재를 주문하지 못해요" className="mb-4">
          학생 주문 화면에 &lsquo;입금 계좌가 아직 등록되지 않았어요&rsquo; 가 떠요.{" "}
          {staff ? (
            <>
              <Link href="/admin/textbook-orders/setup#accounts" className="font-bold text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
                교재·입금 계좌 설정
              </Link>
              에서 은행 · 계좌번호 · 예금주를 넣어 주세요.
            </>
          ) : (
            "강사님께 교재·입금 계좌 설정에서 계좌를 넣어 달라고 부탁해 주세요."
          )}
        </Alert>
      )}

      {/* 새 교재주문 알림 — 조교가 이 기기에서 켠다 (2026-10-27 Alan "○○○(조교)인데 불라방 교재주문을 담당하는 사람이야 … 알림 푸시를 받을 수 있도록").
          조교에게는 알림 설정 화면이 없어 여기서 켠다 — 켠 조교에게만 간다 (push-actions.ts). 강사 · 관리자는 알림 설정 화면을 쓴다 */}
      {!staff && (
        <section aria-labelledby="order-push-title" className="card mb-4 p-4 sm:p-5">
          <h2 id="order-push-title" className="flex items-center gap-2 text-base font-black text-ink">
            <Icon name="bell" size={22} />
            새 교재주문 알림
          </h2>
          <p className="mb-3 mt-1 text-sm text-slate">불라방 학생이 교재를 주문하면 이 기기로 바로 알려 드려요. 교재주문을 맡은 분이 알림 받을 휴대폰에서 켜 주세요.</p>
          <PushSetup publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} audience="order" />
        </section>
      )}

      {/* 현장수령 예정 (2026-10-07 Alan — "무슨날짜에 올껀지, 몇시쯤 올껀지") — 탭을 넘기지 않아도 누가 언제 오는지 보이게 */}
      {(pickups ?? []).length > 0 && <PickupSchedule pickups={pickups ?? []} today={today} />}

      <FilterTabs basePath="/admin/textbook-orders" paramKey="status" current={status} tabs={TABS.map((t) => ({ ...t, count: counts[t.value] }))} />

      {orders.length === 0 ? (
        <EmptyState icon="orders" title="해당 상태의 교재 주문이 없습니다" />
      ) : (
        // 휴대폰 · 태블릿(lg 미만)은 주문마다 간단한 카드, 누르면 그 자리에서 상세 · 처리 (2026-10-27 Alan — "Pc에서는 저렇게 보여도 괜찮은데,
        // 모바일에서는 쫌 불편해 … 학생의 교재주문신청을 간략하게 보여주고, 그 학생을 클릭하면 상세정보가 나오도록!"). PC 는 표 그대로
        <OrderList orders={orders} staff={staff} back={back} used={usedTracking} openId={openId} />
      )}
    </>
  );
}
