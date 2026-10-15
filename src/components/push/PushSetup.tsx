"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { startInstall } from "@/components/pwa/install-store";
import { deletePushSubscription, ownsPushDevice, savePushSubscription, sendTestPush } from "@/app/admin/notifications/actions";
import { deleteStudentPushSubscription, ownsStudentPushDevice, saveStudentPushSubscription, sendStudentTestPush } from "@/app/my/notifications/push-actions";
import { detectPush, disablePush, enablePush, type PushState } from "./push-client";

/**
 * 이 기기에서 푸시 알림 켜기 · 끄기 · 테스트.
 * - staff: 관리자 알림 설정 (`/admin/notifications`) — 등업신청 · 교재주문 · 네이버 예약 …
 * - student: 학생 알림 (`/my/notifications`, 2026-10-15) — 숙제 미제출 · 불라방 시작만
 * 저장은 audience 마다 다른 서버 액션이다 (각자 로그인한 사람의 기기만 저장한다).
 */
const ACTIONS = {
  staff: { save: savePushSubscription, remove: deletePushSubscription, test: sendTestPush, owns: ownsPushDevice },
  student: { save: saveStudentPushSubscription, remove: deleteStudentPushSubscription, test: sendStudentTestPush, owns: ownsStudentPushDevice },
} as const;

const TEXT = {
  staff: { device: "이 기기", topic: "이 기기는", where: "관리자 > 알림 설정" },
  student: { device: "이 휴대폰", topic: "이 휴대폰은", where: "마이 > 알림" },
} as const;

export function PushSetup({ publicKey, audience = "staff" }: { publicKey: string | null; audience?: "staff" | "student" }) {
  const router = useRouter();
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "warning"; text: string } | null>(null);
  const actions = ACTIONS[audience];
  const text = TEXT[audience];

  useEffect(() => {
    let cancelled = false;
    detectPush(actions.owns)
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, [actions.owns]);

  async function enable() {
    if (!publicKey) {
      setNotice({ kind: "warning", text: "서버에 알림 키가 설정되지 않았어요. 관리자에게 알려 주세요." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      // 아이폰은 버튼을 누른 바로 그 순간에 권한을 물어야 한다
      const next = await enablePush(publicKey, actions.save);
      setState(next);
      if (next === "on") {
        setNotice({ kind: "success", text: `${text.device}에서 알림을 받아요. 테스트 알림으로 확인해 보세요.` });
        router.refresh();
      }
    } catch (error) {
      setNotice({ kind: "warning", text: error instanceof Error && error.message ? `알림을 켜지 못했어요. ${error.message}` : "알림을 켜지 못했어요." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setNotice(null);
    try {
      await disablePush(actions.remove);
      setState("off");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await actions.test();
      setNotice(res.ok ? { kind: "success", text: res.message ?? "보냈어요." } : { kind: "warning", text: res.error });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {state === "loading" && <p className="text-sm text-slate">{text.device}의 알림 상태를 확인하고 있어요…</p>}

      {state === "ios-install" && (
        <Alert kind="info" title="아이폰은 홈 화면에 추가한 뒤에 알림을 받을 수 있어요">
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>사파리 아래쪽의 공유 버튼을 누르고 &ldquo;홈 화면에 추가&rdquo;를 고르세요.</li>
            <li>홈 화면에 생긴 역전토익 아이콘으로 사이트를 여세요.</li>
            <li>
              {text.where}로 와서 &ldquo;{text.device}에서 알림 받기&rdquo;를 누르세요.
            </li>
          </ol>
          <p className="mt-2 text-xs">iOS 16.4 이상에서 동작해요.</p>
          {audience === "student" && (
            <button type="button" onClick={() => void startInstall()} className="btn-secondary mt-3 !px-4 !py-2 text-sm">
              <Icon name="download" size={18} />
              홈 화면에 추가하는 법 보기
            </button>
          )}
        </Alert>
      )}

      {state === "unsupported" && (
        <Alert kind="warning" title="이 브라우저는 푸시 알림을 지원하지 않아요">
          안드로이드는 크롬, 아이폰은 홈 화면에 추가한 역전토익 아이콘으로 열어 주세요.
        </Alert>
      )}

      {state === "denied" && (
        <Alert kind="warning" title="알림이 차단돼 있어요">
          휴대폰 설정의 알림 메뉴에서 역전토익(또는 사용 중인 브라우저)의 알림을 허용한 뒤 이 페이지를 새로고침해 주세요.
        </Alert>
      )}

      {state === "off" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate">{text.topic} 아직 알림을 받지 않아요.</p>
          <button type="button" onClick={enable} disabled={busy} className="btn-primary">
            <Icon name="bell" size={20} className="brightness-0 invert" />
            {busy ? "켜는 중…" : `${text.device}에서 알림 받기`}
          </button>
        </div>
      )}

      {state === "on" && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Icon name="success" size={22} />
            {text.device}에서 알림을 받고 있어요
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={test} disabled={busy} className="btn-primary">
              {busy ? "보내는 중…" : "테스트 알림 보내기"}
            </button>
            <button type="button" onClick={disable} disabled={busy} className="btn-secondary">
              {text.device} 알림 끄기
            </button>
          </div>
        </div>
      )}

      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}
    </div>
  );
}
