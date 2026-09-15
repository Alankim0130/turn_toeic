import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { PushSetup } from "@/components/admin/notifications/PushSetup";
import { SettingsForm } from "@/components/admin/notifications/SettingsForm";
import { CopyField } from "@/components/admin/notifications/CopyField";
import { isAdmin, requireStaff } from "@/lib/auth";
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
  const { user, profile } = await requireStaff();
  const supabase = await createClient();
  const [{ data: settings }, { data: devices }, { count: naverCount }] = await Promise.all([
    supabase.from("notification_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("push_subscriptions").select("id, user_agent, created_at, last_sent_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("naver_reservations").select("id", { count: "exact", head: true }),
  ]);

  const values = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k.key, settings ? settings[k.key] : true]));
  const admin = isAdmin(profile.role);
  const webhookUrl = `${site.url}/api/naver-reservations`;
  const secret = admin ? (process.env.NAVER_WEBHOOK_SECRET ?? "") : "";

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
            <Icon name="calendar" size={26} />네이버 예약 연결
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            네이버는 예약 목록을 외부에 열어 주지 않아요. 그래서 네이버가 보내는 예약 알림(문자·메일·앱 알림)을 아래 주소로 전달받아 예약 날짜와 시각을 읽고,
            대시보드에 표시하면서 푸시로 알려 드려요. 지금까지 받은 알림은 <b className="text-ink">{naverCount ?? 0}건</b>이에요.
          </p>

          {admin ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <CopyField label="연결 주소" value={webhookUrl} />
              <CopyField label="연결 코드 (다른 사람에게 알려주지 마세요)" value={secret} secret />
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm text-slate">연결 주소와 코드는 관리자 계정에서만 볼 수 있어요.</p>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl2 border border-line p-4">
              <h3 className="font-black text-ink">아이폰에서 예약 문자를 전달할 때</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate">
                <li>단축어 앱 &gt; 자동화 &gt; 새로운 자동화 &gt; 메시지를 고릅니다.</li>
                <li>&ldquo;메시지 내용에 포함&rdquo;에 네이버 예약 문자에 늘 들어가는 단어를 넣고 &ldquo;즉시 실행&rdquo;으로 둡니다.</li>
                <li>동작으로 &ldquo;URL의 콘텐츠 가져오기&rdquo;를 추가하고 방법 POST, 헤더 Authorization 에 <code>Bearer 연결코드</code>를 넣습니다.</li>
                <li>요청 본문은 JSON 으로 두고 키 <code>text</code> 에 &ldquo;단축어 입력&rdquo;을 넣으면 끝이에요.</li>
              </ol>
            </article>
            <article className="rounded-xl2 border border-line p-4">
              <h3 className="font-black text-ink">안드로이드·메일로 받을 때</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate">
                <li>안드로이드는 매크로드로이드 같은 자동화 앱으로 네이버 예약 문자나 앱 알림을 받으면 같은 주소로 보내면 돼요.</li>
                <li>보낼 내용은 알림 원문 그대로 <code>{`{"text": "원문"}`}</code> 형식이면 됩니다.</li>
                <li>메일로 알림을 받는다면 메일 전달 연결이 따로 필요해요.</li>
              </ul>
            </article>
          </div>
        </section>
      </div>
    </>
  );
}
