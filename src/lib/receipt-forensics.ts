/**
 * 수강증 위조 신호 — **색 팔레트 지문** (2026-09-19 Alan 요청).
 *
 * > Alan: "너가 방법을 안찾고 AI 이미지를 구분할 방법이 없다면 끝인거지뭐..
 * >        색상이라던지 폰트비교라던지 등 뭐 시도도 안해보고 안된다고 하니뭐.."
 *
 * 이미지만 보고 위조를 **증명**할 수는 없다. 하지만 수강증은 아무 사진이 아니라 **YBM 앱 화면 캡처**라
 * 색이 역할마다 고정돼 있다 — 파란 티켓 카드, 노란 `NN월 과정` 배지. 화면을 그대로 캡처했다면
 * 그 색들이 **정확히 같은 값으로 큰 면적**을 차지한다. 사람이 그리거나 AI 가 만든 그림은 그러지 못한다.
 *
 * ## 실측 (2026-09-19, 실물 수강증 `__fixtures__/receipt-phone-screenshot.png` 과 그 변형들)
 *
 * | 이미지 | 카드 파랑 | 배지 노랑 |
 * |---|---|---|
 * | 실물 원본 (1242×2688 PNG) | 39.99% | 0.62% |
 * | 카톡 전송 흉내 JPEG q95 / q85 / q70 | 39.09 / 38.56 / **37.78%** | 0.55 / 0.52 / **0.46%** |
 * | 1080px 로 줄여 보낸 것 | 38.20% | 0.50% |
 * | 색이 흔들린 것 (생성물·재촬영) | **0.05%** | **0.00%** |
 * | 강사 사진 · 후기 캡쳐 9장 (음성 대조군) | 0.00% | 0.00% |
 *
 * 진짜의 최저(37.78%)와 가짜의 최고(0.05%) 사이가 **750배**라 경계를 어디에 둬도 안전하다.
 * 그래서 기준을 한참 아래(카드 15% · 배지 0.15%)에 둔다 — 넉넉하게 통과시키는 쪽이 맞다.
 *
 * ## 반대로 **쓰지 못한 것** (재 보고 버렸다 — 다시 시도하지 말 것)
 * - **색 평탄도**(상위 10색이 차지하는 비율): 카톡 JPEG 이 83%, 색을 흔든 위조본이 91% 로 **방향이 거꾸로** 나온다.
 * - **낱말 단위 라벨↔값 짝짓기**: OCR 이 `수강센터` 를 `수`/`강`/`센터` 로 쪼개는 일이 잦아
 *   **실물 수강증도 6줄 중 5줄이 어긋난 것으로** 나왔다. 오탐 재앙이라 버렸다.
 * - **열 정렬 흩어짐(σ)**: 카톡·축소에 강하긴 한데(n=9, σ≈1‰ 유지) 한 줄만 고친 위조를 못 가린다.
 *
 * ## 이 판정이 **못 잡는 것** — 스태프 눈과 규칙 10(계정 통합)이 맡는다
 * 진짜 수강증 그림을 그대로 두고 **글자만 고친 것**은 팔레트가 그대로라 통과한다 (실측 39.61%).
 * 그쪽은 `capturedAt` 중복(같은 초에 캡처된 수강증이 두 계정에 있으면 한쪽이 복사본)과 파일 해시가 맡는다.
 *
 * ## 고칠 일이 생기면
 * **YBM 이 앱 디자인을 바꾸면 이 색이 통째로 어긋난다.** 증상은 "어느 날부터 자동 등업이 전부 멈추고
 * 죄다 검토 대기로 쌓인다" 이다 — 거절되지는 않는다(`paletteVerdict` 는 자동 승인만 막는다).
 * 그때는 새 수강증 한 장을 받아 색을 재고 `RECEIPT_SKINS` 에 줄을 더한다. **지우지 말고 더한다** —
 * 옛 앱을 쓰는 학생의 캡처도 한동안 들어온다. 홈페이지(PC) 캡처의 색은 아직 샘플이 없어 넣지 못했다.
 */

/** 한 색을 같은 색으로 볼 거리 (RGB 유클리드). JPEG 가 흔드는 폭(실측 ≤2.4)보다 한참 넉넉하다 */
export const PALETTE_TOLERANCE = 12;

/** 팔레트를 잴 때 이 폭으로 줄인다 — 비율이라 값이 안 변하고(실측 39.99→39.98%) 시간은 절반이 된다 */
export const PALETTE_SAMPLE_WIDTH = 480;

export type SkinColor = {
  /** 사람이 읽을 이름. 승인 화면에 그대로 나온다 */
  label: string;
  rgb: readonly [number, number, number];
  /** 화면에서 이 색이 최소 몇 %를 차지해야 하는가 */
  minShare: number;
};

export type ReceiptSkin = { key: string; label: string; colors: readonly SkinColor[] };

/**
 * 정품 수강증 화면의 색. **하나라도 맞으면 통과**다 (앱 버전이 여럿일 수 있다).
 * 색 값은 실물 캡처에서 잰 것이고 짐작해 넣은 것이 없다.
 */
export const RECEIPT_SKINS: readonly ReceiptSkin[] = [
  {
    key: "app-blue-ticket",
    label: "YBM 앱 (파란 티켓 카드)",
    colors: [
      { label: "카드 파랑", rgb: [0x3e, 0x89, 0xe3], minShare: 15 },
      { label: "과정 배지 노랑", rgb: [0xff, 0xd2, 0x1f], minShare: 0.15 },
    ],
  },
];

/** 팔레트에 든 모든 색 (중복 없이) — 재는 쪽이 무엇을 세야 하는지 알려 준다 */
export function paletteColors(): { key: string; rgb: readonly [number, number, number] }[] {
  const seen = new Map<string, { key: string; rgb: readonly [number, number, number] }>();
  for (const skin of RECEIPT_SKINS) {
    for (const c of skin.colors) seen.set(colorKey(c.rgb), { key: colorKey(c.rgb), rgb: c.rgb });
  }
  return [...seen.values()];
}

export function colorKey(rgb: readonly [number, number, number]): string {
  return rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** 색 키 → 그 색이 화면에서 차지하는 비율(%) */
export type PaletteShares = Record<string, number>;

export type PaletteVerdict = {
  /** 정품 화면으로 보이는가. **못 쟀으면(null) 통과**시킨다 — 근거 없이 막지 않는다 */
  ok: boolean;
  /** 맞은 팔레트 */
  skin: string | null;
  /** 사람이 읽을 한 줄 (승인 화면·로그) */
  note: string;
  /** 기준에 못 미친 색들 — 무엇이 왜 어긋났는지 */
  missing: { label: string; share: number; minShare: number }[];
};

/**
 * 잰 비율로 정품 화면인지 판정한다. **거절하지 않는다 — 자동 승인만 막는 신호다.**
 * 못 쟀거나(shares 가 null) 팔레트가 비어 있으면 `ok: true` 로 지나간다 (근거가 없으면 막지 않는다).
 */
export function paletteVerdict(shares: PaletteShares | null | undefined): PaletteVerdict {
  if (!shares) return { ok: true, skin: null, note: "색을 재지 못했어요 (판정에 쓰지 않음)", missing: [] };

  let best: { skin: ReceiptSkin; missing: PaletteVerdict["missing"] } | null = null;
  for (const skin of RECEIPT_SKINS) {
    const missing = skin.colors
      .map((c) => ({ label: c.label, share: shares[colorKey(c.rgb)] ?? 0, minShare: c.minShare }))
      .filter((m) => m.share < m.minShare);
    if (missing.length === 0) {
      const detail = skin.colors.map((c) => `${c.label} ${(shares[colorKey(c.rgb)] ?? 0).toFixed(2)}%`).join(" · ");
      return { ok: true, skin: skin.key, note: `${skin.label} 화면이 맞아요 — ${detail}`, missing: [] };
    }
    // 덜 어긋난 팔레트를 대표로 보여 준다
    if (!best || missing.length < best.missing.length) best = { skin, missing };
  }

  const missing = best?.missing ?? [];
  const detail = missing.map((m) => `${m.label} ${m.share.toFixed(2)}% (기준 ${m.minShare}%)`).join(" · ");
  return {
    ok: false,
    skin: null,
    note: `YBM 수강증 화면의 색이 아니에요 — ${detail}`,
    missing,
  };
}
