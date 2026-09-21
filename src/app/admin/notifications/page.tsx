import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { PushSetup } from "@/components/admin/notifications/PushSetup";
import { SettingsForm } from "@/components/admin/notifications/SettingsForm";
import { requireStaff } from "@/lib/auth";
import { NOTIFICATION_KINDS } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import { formatDate } from "@/lib/utils";
import { removeDevice } from "./actions";

export const metadata: Metadata = { title: "알림 설정", robots: { index: false } };

function deviceLabel(ua: string | null) {
  if (!ua) return "알 수 없는 기기";
  const ios = /iPhone|iPad|iPod/.test(ua);
  const os = ios ? "아이폰" : /Android/.test(ua) ? "안드로이드" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "기기";
  const app =
    ios && !/Safari\//.test(ua)
      ? "홈 화면 앱"
      : /SamsungBrowser/.test(ua)
        ? "삼성 인터넷"
        : /EdgA?\//.test(ua)
          ? "Edge"
          : /CriOS|Chrome\//.test(ua)
            ? "Chrome"
            : /Firefox\//.test(ua)
              ? "Firefox"
              : /Safari\//.test(ua)
                ? "Safari"
                : "브라우저";
  return `${os} · ${app}`;
}

const dateTime = (iso: string) => formatDate(iso, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function NotificationsPage() {
  const { user } = await requireStaff();
  const supabase = await createClient();
  const [{ data: settings }, { data: devices }, { data: naver }] = await Promise.all([
    supabase.from("notification_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("push_subscriptions").select("id, user_agent, created_at, last_sent_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("naver_sync_status").select("last_success_at, last_error, consecutive_failures, slots").maybeSingle(),
  ]);

  const values = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k.key, settings ? settings[k.key] : true]));

  return (
    <>
      <PageHeader icon="bell" title="알림 설정" description="관리자 알림은 휴대폰 푸시로 받아요. 알림을 받을 기기마다 한 번씩 켜 주세요." />

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="device-title" className="card p-5">
          <h2 id="device-title" className="mb-4 flex items-center gap-2 text-lg font-black text-ink">
            <Icon name="bell" size={26} />이 기기에서 알림 받기
          </h2>
          <PushSetup publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
        </section>

        <section aria-labelledby="kinds-title" className="card p-5">
          <h2 id="kinds-title" className="mb-4 flex items-center gap-2 text-lg font-black text-ink">
            <Icon name="bolt" size={26} />받을 알림
          </h2>
          <SettingsForm kinds={NOTIFICATION_KINDS} values={values} />
        </section>

        <section aria-labelledby="devices-title" className="card p-5 lg:col-span-2">
          <h2 id="devices-title" className="mb-3 text-lg font-black text-ink">
            알림 받는 기기 <span className="text-sm font-bold text-slate">{(devices ?? []).length}대</span>
          </h2>
          {(devices ?? []).length === 0 ? (
            <p className="rounded-xl bg-brand-50/60 px-4 py-6 text-center text-sm text-slate">아직 알림을 켠 기기가 없어요.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(devices ?? []).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <p className="font-bold text-ink">{deviceLabel(d.user_agent)}</p>
                    <p className="text-xs text-slate">
                      {dateTime(d.created_at)} 등록{d.last_sent_at ? ` · 마지막 알림 ${dateTime(d.last_sent_at)}` : ""}
                    </p>
                  </div>
                  <form action={removeDevice}>
                    <input type="hidden" name="id" value={d.id} />
                    <button type="submit" className="btn-ghost !px-3 !py-1.5 text-xs">
                      목록에서 삭제
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="naver" aria-labelledby="naver-title" className="card scroll-mt-24 p-5 lg:col-span-2">
          <h2 id="naver-title" className="flex items-center gap-2 text-lg font-black text-ink">
            <Icon name="calendar" size={26} />네이버 예약 자동 확인
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            10분마다 네이버 예약 페이지의 &ldquo;역전토익 강사상담&rdquo; 칸을 확인해요. 예약이 새로 잡히거나 취소되면 위에서 &ldquo;네이버 예약&rdquo;을 켜 둔
            기기로 바로 알림이 가고, 대시보드에도 바로 보여요. 네이버는 예약한 사람이 누구인지 알려 주지 않아서 날짜·시각·인원만 와요.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface px-4 py-3">
              <dt className="text-xs font-bold text-slate">마지막 확인</dt>
              <dd className="mt-1 font-black text-ink">{naver?.last_success_at ? dateTime(naver.last_success_at) : "아직 없음"}</dd>
            </div>
            <div className="rounded-xl bg-surface px-4 py-3">
              <dt className="text-xs font-bold text-slate">지금 보고 있는 칸</dt>
              <dd className="mt-1 font-black text-ink">{naver?.slots ?? 0}개</dd>
            </div>
            <div className={naver?.consecutive_failures ? "rounded-xl bg-amber-50 px-4 py-3" : "rounded-xl bg-surface px-4 py-3"}>
              <dt className="text-xs font-bold text-slate">상태</dt>
              <dd className={naver?.consecutive_failures ? "mt-1 text-sm font-bold text-amber-800" : "mt-1 font-black text-ink"}>
                {naver?.consecutive_failures ? `${naver.consecutive_failures}번 연속 실패 · ${naver.last_error ?? "알 수 없는 오류"}` : "정상"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm">
            <a href={site.academy.naverBookingUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-600 hover:underline">
              네이버 예약 페이지 열기
            </a>
          </p>
        </section>
      </div>
    </>
  );
}
