"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import { getInstallEnv } from "./install-store";

/**
 * 새로고침 (2026-09-16 Alan 요청). 홈 화면 앱은 주소창이 없어 새로고침할 방법이 없다.
 * 당겨서 새로고침(`PullToRefresh`)이 주된 길이고, 이 버튼은 확실한 쪽이다 —
 * 손가락 제스처가 안 먹는 상황(스크롤 도중·긴 화면)에서도 항상 된다.
 * **홈 화면 앱으로 열었을 때만 보인다** — 브라우저에는 이미 새로고침 버튼이 있다.
 */
export function RefreshButton({ onStart }: { onStart?: () => void }) {
  const [busy, setBusy] = useState(false);
  // 서버 렌더에서는 늘 false — 마운트한 뒤에 판정해야 하이드레이션이 어긋나지 않는다
  const standalone = useSyncExternalStore(
    () => () => {},
    () => getInstallEnv().standalone,
    () => false,
  );
  if (!standalone) return null;

  return (
    <button
      type="button"
      className="btn-ghost w-full"
      aria-busy={busy}
      onClick={() => {
        setBusy(true);
        onStart?.();
        window.location.reload();
      }}
    >
      <Icon name="bolt" size={18} />
      {busy ? "새로고침 중…" : "새로고침"}
    </button>
  );
}
