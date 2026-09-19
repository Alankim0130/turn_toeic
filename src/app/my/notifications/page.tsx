import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { cn, formatDate } from "@/lib/utils";
import { getMyMessages } from "../_lib/queries";
import { MarkRead } from "./MarkRead";

export const metadata: Metadata = { title: "알림", robots: { index: false } };

/**
 * 학생 알림함 (2026-09-18 Alan — "학생 계정에서 선생님에게 알림을 받을 수 있는 공간").
 * 스태프가 보낸 알림(`student_messages`)만 쌓인다. 문자·카톡·푸시가 아니라 **앱 안에서만** 보인다.
 * 열면 안 읽은 것이 읽음으로 바뀐다. 비대면 스터디 인증 알림에는 내 스터디로 가는 버튼이 붙는다.
 */
export default async function NotificationsPage() {
  await requireUser("/my/notifications");
  const messages = await getMyMessages();
  const unread = messages.filter((m) => !m.read_at).length;

  return (
    <div className="space-y-6">
      <MarkRead unread={unread} />
      <PageHeader icon="bell" title="알림" description="선생님이 보낸 알림이 여기에 쌓여요." />

      {messages.length === 0 ? (
        <EmptyState icon="bell" title="아직 알림이 없어요" description="선생님이 보낸 안내나 확인 요청이 오면 여기에서 볼 수 있어요." />
      ) : (
        <Reveal>
          <ul className="space-y-3">
            {messages.map((m) => {
              const related = (m.related ?? {}) as { materialId?: number; date?: string };
              return (
                <li key={m.id} className={cn("card p-5", !m.read_at && "border-brand-300 bg-brand-50/40")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="font-black text-ink">
                      {!m.read_at && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-brand-500 align-middle" aria-label="안 읽음" />}
                      {m.title}
                    </h2>
                    <span className="text-xs text-mist">
                      {m.sender_name && `${m.sender_name} 선생님 · `}
                      {formatDate(m.created_at, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{m.body}</p>
                  {/* 알림 종류마다 할 일이 다르다 — 비대면 인증과 숙제 점검은 **완전히 다른 것**이다 */}
                  {m.kind === "study_checkin" && (
                    <Link href="/my/study" className="btn-primary mt-3 !px-4 !py-2 text-sm">
                      내 스터디에서 인증하기{related.date ? ` (${formatDate(related.date, { month: "numeric", day: "numeric" })})` : ""}
                    </Link>
                  )}
                  {m.kind === "homework_checked" && (
                    <Link href="/my/homework" className="btn-primary mt-3 !px-4 !py-2 text-sm">
                      숙제업로드에서 확인하기
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Reveal>
      )}
    </div>
  );
}
