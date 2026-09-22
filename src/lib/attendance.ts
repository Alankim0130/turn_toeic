/**
 * QR 출석 (2026-09-21 Alan — "출석을 범위에 넣어줘. 입실과 퇴실 다 받자! 조교에게도 명단을 열어줘").
 *
 * **판정은 DB 함수 `public.attendance_scan` 한곳이다** (마이그레이션 20260921130500 · 20260922103000) — 토큰·배정·시각을 서버가 본다.
 * QR 은 강의실 앞에 붙이는 **인쇄용 포스터 하나**다 (2026-09-22 Alan — 30초마다 바뀌던 화면 QR 과 6자리 코드는 없앴다).
 * 이 파일은 그 결과를 학생이 읽는 말로 바꾸고, 포스터 QR 에 담을 주소를 만드는 일만 한다 (순수 함수 — `attendance.test.ts`).
 * 규칙 숫자(30분 전·7분 지각·30분 체류)는 SQL 에 있다. 안내 문구에 같은 숫자를 적었으니 바꾸면 여기도 고친다.
 */

export type ScanResult = {
  action: string;
  label?: string;
  at?: string;
  late?: boolean;
  starts?: string;
  ends?: string;
  stay?: number;
  opens?: string;
};

export type ScanView = { tone: "success" | "info" | "warning"; title: string; body: string };

/** `attendance_scan` 결과 → 학생 화면 문구 */
export function scanView(r: ScanResult): ScanView {
  const cls = r.label ? `${r.label} · ` : "";
  switch (r.action) {
    case "check_in":
      return r.late
        ? { tone: "warning", title: "입실했어요 (지각)", body: `${cls}${r.at} 입실. 수업이 ${r.starts}에 시작했어요. 끝나고 나갈 때 한 번 더 찍으면 출석이 확정돼요.` }
        : { tone: "success", title: "입실했어요", body: `${cls}${r.at} 입실. 수업 끝나고 나갈 때 한 번 더 찍으면 출석이 확정돼요.` };
    case "check_out":
      return { tone: "success", title: "퇴실했어요 — 출석 확정", body: `${cls}${r.at} 퇴실 · ${r.stay}분 머물렀어요.` };
    case "already_in":
      return { tone: "info", title: "이미 입실했어요", body: `${cls}${r.at}에 입실했어요. 퇴실은 입실하고 30분이 지나면 찍을 수 있어요.` };
    case "already_done":
      return { tone: "info", title: "이미 처리된 수업이에요", body: `${cls}오늘 출석이 이미 끝났거나 선생님이 처리했어요.` };
    case "too_early":
      return { tone: "info", title: "아직 입실할 수 없어요", body: `입실은 수업 시작 30분 전인 ${r.opens}부터 돼요.` };
    case "class_over":
      return { tone: "warning", title: "오늘 수업 시간이 지났어요", body: "출석을 못 찍었다면 선생님께 말씀해 주세요." };
    case "no_class_today":
      return { tone: "info", title: "오늘은 내 수업이 없어요", body: "현장 수업이 있는 날 강의실에서 찍어 주세요." };
    case "live_student":
      return { tone: "info", title: "불라방 수강생은 출석을 찍지 않아요", body: "불라방은 수업 시작 알림을 받고 불라방에서 입장하면 돼요." };
    case "recorded_day":
      return { tone: "info", title: "오늘은 인강 날이에요", body: "화목금 저녁은 그 날 오전 수업 녹화본을 보는 날이라 출석을 찍지 않아요." };
    case "not_started":
      return { tone: "info", title: "아직 개강 전이에요", body: "개강일부터 출석을 찍을 수 있어요." };
    case "bad_token":
      return {
        tone: "warning",
        title: "출석 QR 이 맞지 않아요",
        body: "강의실 앞에 붙은 출석 QR 을 다시 찍어 주세요. 그래도 안 되면 QR 이 새로 바뀌기 전의 옛 종이일 수 있어요 — 선생님께 말씀해 주세요.",
      };
    case "too_many":
      return { tone: "warning", title: "잠시 뒤 다시 해 주세요", body: "맞지 않는 QR 을 여러 번 찍어 10분 동안 잠겼어요. 잠시 뒤 강의실 앞 출석 QR 을 찍어 주세요." };
    case "login_required":
      return { tone: "warning", title: "로그인이 필요해요", body: "로그인한 뒤 다시 찍어 주세요." };
    default:
      return { tone: "warning", title: "출석을 처리하지 못했어요", body: "잠시 뒤 다시 찍어 주세요. 계속 안 되면 선생님께 말씀해 주세요." };
  }
}

/** 포스터 QR 이 담는 주소 — 휴대폰 기본 카메라로 찍으면 이 주소가 열린다 */
export function attendUrl(siteUrl: string, token: string) {
  return `${siteUrl.replace(/\/+$/, "")}/attend?t=${encodeURIComponent(token)}`;
}

/** 출석 상태 이름 (명단 · 내 출석) */
export const ATTENDANCE_STATUS: Record<string, { label: string; className: string }> = {
  out: { label: "출석", className: "bg-emerald-100 text-emerald-800" },
  in: { label: "입실만", className: "bg-amber-100 text-amber-800" },
  manual: { label: "출석 인정", className: "bg-brand-100 text-brand-700" },
  absent: { label: "결석", className: "bg-red-100 text-red-700" },
  none: { label: "미출석", className: "bg-line text-slate" },
};
