import { describe, expect, it } from "vitest";
import { fuzzyIncludes, levenshtein, normalizeReceiptText, parseReceipt, receiptComplete, receiptHasName } from "@/lib/receipt";

/** CLAUDE.md "수강증 표기 규칙" 표의 강좌명. 학원명·강사명은 실제 수강증 양식을 받기 전까지의 가정 */
const receipt = (course: string, extra = "") => `YBM어학원 서면센터\n역전토익 ${course}\n강사 이혜영\n수강생 김민수\n${extra}`;

describe("정규화", () => {
  it("전각 숫자·구분자를 반각으로", () => {
    const { compact } = normalizeReceiptText("１０：００～１２：１０");
    expect(compact).toBe("10:00~12:10");
  });
  it("시각의 . ; 구분자를 : 로, 범위의 - – 를 ~ 로 (시각 사이에서만)", () => {
    const { compact } = normalizeReceiptText("10.00 - 12.10 / 18;30–20;40 / 2026-09-16 / 010-1234-5678");
    expect(compact).toContain("10:00~12:10");
    expect(compact).toContain("18:30~20:40");
    expect(compact).toContain("2026-09-16"); // 날짜 하이픈은 그대로
    expect(compact).toContain("010-1234-5678"); // 전화번호도 그대로
  });
});

describe("편집거리", () => {
  it("한 음절 오인식은 거리 1", () => {
    expect(levenshtein("역전토익", "력전토익")).toBe(1);
    expect(levenshtein("역전토익", "역젼토익")).toBe(1);
    expect(fuzzyIncludes("YBM 력전토익 650", "역전토익")).toBe(true);
    expect(fuzzyIncludes("YBM 첫토익 650", "역전토익")).toBe(false);
  });
});

describe("표기 규칙 표 — 주3일 / 주5일 · 트랙 · 방식", () => {
  it("주5일 (월18회) → 두 트랙 · 현장", () => {
    const p = parseReceipt(receipt("650 주5일 (월18회) 10:00~12:10"));
    expect(p.weekly).toBe(5);
    expect(p.tracks).toEqual(["mwf", "ttf"]);
    expect(p.mode).toBe("onsite");
  });
  it("주5일 (월18회 라이브방송) → 두 트랙 · 불라방", () => {
    const p = parseReceipt(receipt("650 주5일 (월18회 라이브방송) 10:00~12:10"));
    expect(p.tracks).toEqual(["mwf", "ttf"]);
    expect(p.mode).toBe("live");
  });
  it("주5일 (월18회) 월수금(현강)+화목금(인강) → 주5일 · 현장 (인강은 불라방이 아니다)", () => {
    const p = parseReceipt(receipt("750 주5일 (월18회) 월수금(현강)+화목금(인강) 18:30~20:40"));
    expect(p.weekly).toBe(5);
    expect(p.tracks).toEqual(["mwf", "ttf"]);
    expect(p.mode).toBe("onsite");
  });
  it("주5일 표기 안의 월수금 글자 때문에 주3일로 오독하지 않는다", () => {
    const p = parseReceipt(receipt("650 주5일 (월18회) 월수금(현강)+화목금(인강)"));
    expect(p.weekly).not.toBe(3);
    expect(p.tracks).toHaveLength(2);
  });
  it("월수금 (월9회) → 주3일 · 월수금 · 현장", () => {
    const p = parseReceipt(receipt("650 월수금 (월9회) 10:00~11:00"));
    expect(p.weekly).toBe(3);
    expect(p.tracks).toEqual(["mwf"]);
    expect(p.mode).toBe("onsite");
  });
  it("화목금 (월9회 라이브방송) → 주3일 · 화목금 · 불라방", () => {
    const p = parseReceipt(receipt("750 화목금 (월9회 라이브방송) 18:30~20:40"));
    expect(p.weekly).toBe(3);
    expect(p.tracks).toEqual(["ttf"]);
    expect(p.mode).toBe("live");
  });
  it("라이브방송이 한 글자 틀려도 불라방으로 읽는다", () => {
    expect(parseReceipt(receipt("650 월수금 (월9회 라이브방숭)")).mode).toBe("live");
  });
  it("주5일이 한 글자 틀려도 주5일로 읽는다", () => {
    const p = parseReceipt(receipt("650 주5알 (월18회)"));
    expect(p.weekly).toBe(5);
  });
});

describe("레벨 · 과정", () => {
  it("650 · 750 · 850 을 숫자로 읽는다", () => {
    expect(parseReceipt(receipt("650 월수금 (월9회)")).level).toBe(650);
    expect(parseReceipt(receipt("750 월수금 (월9회)")).level).toBe(750);
    expect(parseReceipt(receipt("850 월수금 (월9회)")).level).toBe(850);
  });
  it("시각 16:50 이나 금액 1650원 의 650 은 레벨이 아니다", () => {
    const p = parseReceipt(receipt("750 월수금 (월9회) 15:30~16:50", "교재 1650원"));
    expect(p.levels).toEqual([750]);
  });
  it("프리미어반 = 스파르타", () => {
    const p = parseReceipt(receipt("650 주5일 (월18회) 프리미어반 10:00~13:40"));
    expect(p.program).toBe("sparta");
    expect(p.level).toBe(650);
    expect(p.tracks).toEqual(["mwf", "ttf"]);
  });
  it("프리미어반이 없으면 점수보장반", () => {
    expect(parseReceipt(receipt("650 주5일 (월18회)")).program).toBe("score");
  });
});

describe("수업 시간 — 그대로 돌려준다 (60/120분으로 가르지 않는다)", () => {
  it("time_block 형식으로 정리하고 분을 계산한다", () => {
    const p = parseReceipt(receipt("650 주5일 (월18회) 10:00~12:10"));
    expect(p.time).toEqual({ start: "10:00", end: "12:10", minutes: 130, timeBlock: "10:00~12:10" });
  });
  it("한 타임(60분)도 그대로", () => {
    expect(parseReceipt(receipt("650 월수금 (월9회) 10:00~11:00")).time?.timeBlock).toBe("10:00~11:00");
  });
  it("850 세 시간대 — 70분과 140분 반은 서로 다른 반이라 라벨을 그대로 둔다", () => {
    expect(parseReceipt(receipt("850 월수금 (월9회) 12:30~13:40")).time?.minutes).toBe(70);
    expect(parseReceipt(receipt("850 월수금 (월9회) 12:30~15:00")).time?.timeBlock).toBe("12:30~15:00");
  });
  it("한 자리 시각은 두 자리로 맞춘다 (반의 time_block 과 같은 형식)", () => {
    expect(parseReceipt(receipt("650 월수금 (월9회) 9:00~11:10")).time?.timeBlock).toBe("09:00~11:10");
  });
  it("시간이 없으면 warning 만 남기고 null", () => {
    const p = parseReceipt(receipt("650 월수금 (월9회)"));
    expect(p.time).toBeNull();
    expect(p.warnings.some((w) => w.includes("수업 시간"))).toBe(true);
  });
});

describe("게이트", () => {
  it("G1: YBM + 서면/부산", () => {
    expect(parseReceipt("YBM어학원 서면센터 역전토익 650").gates.academy).toBe(true);
    expect(parseReceipt("YBM어학원 강남센터 역전토익 650").gates.academy).toBe(false);
    expect(parseReceipt("해커스 부산 역전토익 650").gates.academy).toBe(false);
  });
  it("G2: 역전토익(오인식 1자 허용) 또는 강사명", () => {
    expect(parseReceipt("YBM 서면 력전토익 650").gates.brand).toBe(true);
    expect(parseReceipt("YBM 서면 토익 650 이영수").gates.brand).toBe(true);
    expect(parseReceipt("YBM 서면 첫토익 650").gates.brand).toBe(false);
  });
  it("G3: 가입 실명은 공백 무시 정확 일치 — 한 글자 다른 이름은 통과시키지 않는다", () => {
    const text = "수강생: 김 민 수";
    expect(receiptHasName(text, "김민수")).toBe(true);
    expect(receiptHasName(text, "김민주")).toBe(false);
    expect(receiptHasName(text, "")).toBe(false);
  });
});

describe("참고 필드", () => {
  // 영수증번호는 읽지 않는다 — 수강증 화면에 없다 (2026-09-18 Alan 확인)
  it("금액은 있으면 읽고 없으면 null", () => {
    const p = parseReceipt(receipt("650 월수금 (월9회)", "수강료 250,000원"));
    expect(p.tuition).toBe(250000);
    expect(parseReceipt(receipt("650 월수금 (월9회)")).tuition).toBeNull();
  });
});

/**
 * 실제 수강증 화면 양식 (2026-09-16 Alan 샘플).
 *
 * 샘플은 다른 브랜드(첫토익) 것이지만 **화면 양식은 같은 YBM 앱**이다. 양식에서 확인한 것:
 *  - 학원 줄은 `수강센터  부산 서면센터` — **`YBM` 글자가 없다.**
 *  - 수강요일 줄은 `[4주-09/02] 월화수목 (월16회)` 처럼 `[N주-MM/DD]` 가 앞에 붙는다.
 *  - 강사는 `데이지(이명진)` 처럼 별명(실명) 꼴일 수 있다.
 *  - 영수증번호는 화면에 **없다** (맨 위 `현재시간`은 캡처 시각이다).
 *
 * 아래 본문은 그 양식에 역전토익 값을 넣어 만든 것이다 (샘플의 실제 이름은 남의 개인정보라 쓰지 않는다).
 */
const screen = (lines: string) => `현재시간 2026-09-16 19:27:43\n09월 과정\n${lines}`;

describe("실제 수강증 화면 양식", () => {
  const 주3일 = screen(
    [
      "역전토익 [종합반]",
      "650 목표",
      "수강생 김민수",
      "수강센터 부산 서면센터",
      "강사 이혜영",
      "강의실 본관 701호",
      "수강요일 [4주-09/04] 월수금 (월9회)",
      "수강시간 10:00~11:00",
      "수강료 298,300원",
    ].join("\n"),
  );

  it("YBM 글자가 없어도 수강센터 + 부산/서면이면 학원 게이트를 통과한다", () => {
    const p = parseReceipt(주3일);
    expect(p.gates.academy).toBe(true);
    expect(p.gates.brand).toBe(true);
  });

  it("지역 단어만 있고 수강센터 줄이 없으면 통과시키지 않는다", () => {
    expect(parseReceipt("부산에서 산 물건 영수증").gates.academy).toBe(false);
  });

  it("주3일 수강증: 트랙 · 레벨 · 시간 · 방식", () => {
    const p = parseReceipt(주3일);
    expect(p.weekly).toBe(3);
    expect(p.tracks).toEqual(["mwf"]);
    expect(p.level).toBe(650);
    expect(p.program).toBe("score");
    expect(p.mode).toBe("onsite");
    expect(p.time?.timeBlock).toBe("10:00~11:00");
  });

  it("주5일 라이브방송 프리미어반: 두 트랙 · 불라방 · 스파르타", () => {
    const p = parseReceipt(
      screen(
        [
          "역전토익 [종합반]",
          "750 목표",
          "수강생 김민수",
          "수강센터 부산 서면센터",
          "강사 이영수",
          "수강요일 [4주-09/04] 주5일 (월18회 라이브방송) 프리미어반",
          "수강시간 10:00~13:40",
        ].join("\n"),
      ),
    );
    expect(p.mode).toBe("live");
    expect(p.weekly).toBe(5);
    expect(p.tracks).toEqual(["mwf", "ttf"]);
    expect(p.program).toBe("sparta");
    expect(p.level).toBe(750);
    expect(p.time?.timeBlock).toBe("10:00~13:40");
  });

  it("월수금(현강)+화목금(인강) 은 주5일 · 현장이다 — 인강은 불라방 신호가 아니다", () => {
    const p = parseReceipt(
      screen(["역전토익 [종합반]", "650 목표", "수강센터 부산 서면센터", "수강요일 [4주-09/04] 주5일 (월18회) 월수금(현강)+화목금(인강)", "수강시간 18:30~20:40"].join("\n")),
    );
    expect(p.weekly).toBe(5);
    expect(p.mode).toBe("onsite");
    expect(p.tracks).toEqual(["mwf", "ttf"]);
  });

  it("OCR 이 콜론을 세미콜론으로 읽어도 시간대를 찾는다 (실측: 13;00~15:10)", () => {
    const p = parseReceipt(screen(["역전토익 [종합반]", "850 목표", "수강센터 부산 서면센터", "수강시간 13;00~15:10"].join("\n")));
    expect(p.time?.timeBlock).toBe("13:00~15:10");
  });
});

describe("스파르타(프리미어)반 과정명 — 중급속성 · 실전속성 (2026-09-18 Alan 확인)", () => {
  const line = (title: string, days: string) => screen(["역전토익 [종합반]", title, "수강센터 부산 서면센터", days, "수강시간 10:00~13:40"].join("\n"));

  it("중급속성이 있으면 프리미어 글자가 없어도 스파르타 650", () => {
    const p = parseReceipt(line("스파르타 650+ 중급속성", "수강요일 [4주-09/04] 주5일 (월18회)"));
    expect(p.program).toBe("sparta");
    expect(p.level).toBe(650);
  });

  it("실전속성이 있으면 스파르타 750", () => {
    const p = parseReceipt(line("750+ 실전속성", "수강요일 [4주-09/04] 주5일 (월18회) 프리미어반"));
    expect(p.program).toBe("sparta");
    expect(p.level).toBe(750);
  });

  it("레벨 숫자를 못 읽어도 과정명으로 레벨을 정한다 (경고 남김)", () => {
    const p = parseReceipt(line("실전속성", "수강요일 주5일 (월18회) 프리미어반"));
    expect(p.level).toBe(750);
    expect(p.warnings.some((w) => w.includes("과정명으로 750"))).toBe(true);
  });

  it("과정명과 숫자가 다르면 경고 — 자동 승인 전에 스태프가 본다", () => {
    const p = parseReceipt(line("850 목표 중급속성", "수강요일 주5일 (월18회) 프리미어반"));
    expect(p.level).toBe(850);
    expect(p.warnings.some((w) => w.includes("달라요"))).toBe(true);
  });

  it("점수보장반 수강증에는 이 단어가 없어 score 로 남는다", () => {
    const p = parseReceipt(line("650 목표", "수강요일 [4주-09/04] 월수금 (월9회)"));
    expect(p.program).toBe("score");
  });
});

describe("실물 수강증 OCR 특성 (2026-09-18 역전토익 8월 수강증)", () => {
  it("강의실이 `온라인 강의` 면 불라방 — `라이브방송` 이 두 줄로 갈려 못 읽어도 된다 (2026-09-18 Alan)", () => {
    // OCR 이 두 칸 배치를 읽은 순서 그대로: "…라이" 다음 줄에 "수강요일" 라벨, 그 다음 "브방송)"
    const p = parseReceipt(screen(["역전토익 [종합반]", "650 목표", "수강센터 부산 서면센터", "강의실 온라인 강의", "[4주-08/04] 주5일 (월18회 라이", "수강요일 .납'", "브방송)", "수강시간 10:00~12:10"].join("\n")));
    expect(p.mode).toBe("live");
    expect(p.weekly).toBe(5);
  });
  it("`라이`·`브방송` 조각만으로는 불라방으로 보지 않는다 — 강의실 줄이 기준이다", () => {
    const p = parseReceipt(screen(["역전토익 [종합반]", "650 목표", "수강센터 부산 서면센터", "강의실 본관 701호", "[4주-08/04] 주5일 (월18회 라이", "수강요일", "브방송)", "수강시간 10:00~12:10"].join("\n")));
    expect(p.mode).toBe("onsite");
  });
  it("현장 수강증은 강의실이 호실이라 현장으로 남는다", () => {
    const p = parseReceipt(screen(["역전토익 [종합반]", "650 목표", "수강센터 부산 서면센터", "강의실 본관 701호", "수강요일 [4주-09/04] 월수금 (월9회)", "수강시간 10:00~11:00"].join("\n")));
    expect(p.mode).toBe("onsite");
  });
  it("강사 줄이 `이영수 .이혜영` 처럼 둘 다 적혀도 브랜드 게이트를 통과한다", () => {
    const p = parseReceipt(screen(["역저토익 [종합반]", "650 목표", "수강센터 부산 서면센터", "강사 이영수 .이혜영", "수강요일 주5일 (월18회)", "수강시간 10:00~12:10"].join("\n")));
    expect(p.gates.brand).toBe(true);
  });
  it("현재시간 줄의 공백이 빠져도(2026-08-0716:19:02) 캡처 날짜와 배지 달을 읽는다", () => {
    const p = parseReceipt("현재시간 2026-08-0716:19:02\n08월 과정\n역전토익 [종합반]\n650 목표\n수강센터 부산 서면센터");
    expect(p.capturedOn).toBe("2026-08-07");
    expect(p.courseMonth).toBe(8);
    // 캡처 시각은 수강 날짜(months)에 넣지 않는다 (2026-09-22) — 캡처한 날은 수강월이 아니다
    expect(p.months).toEqual([]);
  });
});

describe("receiptComplete — 판정 키가 다 읽혔는가 (OCR 이 남은 변형을 건너뛰는 기준)", () => {
  const FULL = `현재시간 2026-08-07 16:19:02
08월 과정
역전토익 [종합반]
650 목표
수강생 김민수
수강센터 부산 서면센터
강사 이영수 .이혜영
강의실 온라인 강의
수강요일 [4주-08/04] 주5일 (월18회 라이브방송)
수강시간 10:00~12:10`;
  it("전부 있으면 true", () => {
    expect(receiptComplete(FULL)).toBe(true);
  });
  it("강의실 줄이 빠지면 false — 방식(현장/불라방)이 기본값으로 잘못 정해질 수 있다", () => {
    expect(receiptComplete(FULL.replace("강의실 온라인 강의\n", ""))).toBe(false);
  });
  it("수강월·시간·레벨 중 하나라도 빠지면 false", () => {
    expect(receiptComplete(FULL.replace("08월 과정\n", ""))).toBe(false);
    expect(receiptComplete(FULL.replace("수강시간 10:00~12:10", ""))).toBe(false);
    expect(receiptComplete(FULL.replace("650 목표\n", "").replace("역전토익 [종합반]", "역전토익 [종합반]"))).toBe(false);
  });
});

describe("캡처 시각 (현재시간 줄)", () => {
  it("현재시간 줄의 날짜를 읽는다 — 공백이 빠져도", () => {
    expect(parseReceipt("현재시간 2026-08-07 16:19:02\n08월 과정").capturedOn).toBe("2026-08-07");
    expect(parseReceipt("현재시간 2026-08-0716:19:02").capturedOn).toBe("2026-08-07");
  });
  it("현재시간 라벨이 안 읽혔으면 첫 날짜, 날짜가 없으면 null", () => {
    expect(parseReceipt("허재시간 2026-09-02 19:27:43").capturedOn).toBe("2026-09-02");
    expect(parseReceipt("역전토익 [종합반] 650 목표").capturedOn).toBeNull();
  });

  /**
   * capturedAt 은 **초까지** 남긴다 (2026-09-19) — 두 계정에 같은 초의 수강증이 있으면 한쪽이 복사본이다.
   * 사람이 같은 초에 두 번 캡처할 수는 없고, **글자를 고쳐도 이 값은 남는다** (파일 해시와 다른 점).
   */
  it("capturedAt 은 시·분·초까지 남긴다", () => {
    expect(parseReceipt("현재시간 2026-08-07 16:19:02\n08월 과정").capturedAt).toBe("2026-08-07T16:19:02");
    expect(parseReceipt("현재시간 2026-08-0716:19:02").capturedAt).toBe("2026-08-07T16:19:02");
    expect(parseReceipt("현재시간 2026-08-07 9:05:07").capturedAt).toBe("2026-08-07T09:05:07");
  });

  it("초가 없거나 말이 안 되는 시각이면 null — 분까지만으로는 남과 겹칠 수 있다", () => {
    expect(parseReceipt("현재시간 2026-08-07 16:19").capturedAt).toBeNull();
    expect(parseReceipt("현재시간 2026-08-07 25:19:02").capturedAt).toBeNull();
    expect(parseReceipt("역전토익 [종합반] 650 목표").capturedAt).toBeNull();
  });

  it("현재시간 라벨을 못 읽으면 날짜는 살아도 시각은 안 쓴다 — 엉뚱한 숫자를 시각으로 읽지 않는다", () => {
    expect(parseReceipt("허재시간 2026-09-02 19:27:43").capturedOn).toBe("2026-09-02");
    expect(parseReceipt("허재시간 2026-09-02 19:27:43").capturedAt).toBeNull();
  });
});

/**
 * 2026-09-22 오류 점검에서 재현한 것들 — 전부 **자동 승인이 엉뚱한 반을 고르거나, 위조 신호가 조용히 꺼지는** 경우다.
 * 아래 `real` 은 실물 8월 수강증을 **폭 700 변형 하나로** 읽은 원문 그대로다 (이름 칸은 가려져 있다).
 * 운영은 이 변형 하나로 판정 키가 다 나오면 나머지 변형을 읽지 않는다 (`receiptComplete`).
 */
describe("오류 점검 (2026-09-22)", () => {
  const real = [
    "419                      1 에 33",
    "매  와이비엠",
    "ㄴ          수강증",
    "현재산 2026-08-07 16:19:02",
    "08월 과정",
    "역전토익 [종합반]",
    "650 목표",
    "수강생",
    "수강센터 부산 서면센터",
    "강사 _ 이영수 .이혜영",
    "레벨   650+",
    "강의실 _ 온라인 강의",
    "이 나주-98704]주5일 (월18회 라이",
    "、 . 、 브방송)",
    "수강시간 10:00~12:10",
    "수강료  264,000원",
    "전체뉴 _ 08출석 _ 수강신청 _ 마이페이지 ㆍ 최근본강의",
  ].join("\n");

  it("폭 700 판독에서 `현재시간` 이 `현재산` 으로 뭉개져도 캡처 시각을 초까지 읽는다 — 같은 초 캡처 검사가 여기에 달렸다", () => {
    const p = parseReceipt(real);
    expect(p.capturedAt).toBe("2026-08-07T16:19:02");
    expect(p.capturedOn).toBe("2026-08-07");
  });

  it("그 변형 하나로 멈춰도(receiptComplete) 캡처 시각·수강 방식 근거가 이미 들어 있다", () => {
    expect(receiptComplete(real)).toBe(true);
    const p = parseReceipt(real);
    expect(p.modeEvidence).toBe("online");
    expect(p.mode).toBe("live");
  });

  it("캡처 시각을 못 읽었으면 멈추지 않는다 — 뒤 변형이 읽을 기회를 준다", () => {
    expect(receiptComplete(real.replace("현재산 2026-08-07 16:19:02", "현재산 2026-08-07"))).toBe(false);
  });

  it("금액의 세 자리 묶음은 레벨이 아니다 — 750 수강증이 `650,000원` 때문에 650 반에 붙을 뻔했다", () => {
    const p = parseReceipt(real.replace("650 목표", "750 목표").replace("650+", "750+").replace("264,000원", "650,000원"));
    expect(p.levels).toEqual([750]);
    expect(p.level).toBe(750);
    expect(parseReceipt("850 목표\n수강료 1,850,000원").levels).toEqual([850]);
    expect(parseReceipt("750 목표\n교재 650원").levels).toEqual([750]);
    expect(parseReceipt("레벨 .650+").levels).toEqual([650]); // OCR 잡점은 막지 않는다
  });

  describe("주5일 — 회차(월18회/월9회)가 먼저, `주5일` 은 숫자 5 가 있어야", () => {
    const 주3일 = screen(["역전토익 [종합반]", "650 목표", "수강센터 부산 서면센터", "강의실 본관 701호", "수강요일 [4주-09/04] 월수금 (월9회)", "수강시간 10:00~11:00"].join("\n"));
    it("화면에 섞인 날짜 `25일` · `9월 5일` · `D-5일` 이나 `일주일` 이 주3일을 주5일로 바꾸지 않는다", () => {
      for (const noise of ["카톡 9월 25일 모임", "9월 5일", "시험 D-5일", "일주일 남음"]) {
        const p = parseReceipt(`${주3일}\n${noise}`);
        expect(p.weekly, noise).toBe(3);
        expect(p.tracks, noise).toEqual(["mwf"]);
      }
    });
    it("회차를 못 읽었을 때도 `5일` 만으로는 주5일이 아니다 — `주5` 가 있어야 한다", () => {
      const noCount = 주3일.replace(" (월9회)", "");
      expect(parseReceipt(`${noCount}\n9월 25일`).weekly).toBe(3);
      expect(parseReceipt(noCount.replace("월수금", "주5일")).weekly).toBe(5);
      expect(parseReceipt(noCount.replace("월수금", "주3일")).weekly).toBeNull();
    });
    it("월18회와 월9회가 함께 읽히면 정하지 않는다 (자동 승인 안 함)", () => {
      const p = parseReceipt(주3일.replace("(월9회)", "(월9회) 주5일 (월18회)"));
      expect(p.weekly).toBeNull();
      expect(p.warnings.some((w) => w.includes("함께"))).toBe(true);
    });
  });

  describe("G3 이름 — `수강생` 칸의 값만 본다", () => {
    const named = (name: string) => real.replace("수강생", `수강생 _ ${name}`);
    it("실물 판독 모양(`수강생 _ 김민수`)을 읽는다 — 줄 끝 찌꺼기는 떼고", () => {
      expect(receiptHasName(named("김민수"), "김민수")).toBe(true);
      expect(receiptHasName(named("김민수 |"), "김민수")).toBe(true);
      expect(receiptHasName(named("김민수"), "김 민수")).toBe(true);
      expect(receiptHasName(named("김민수"), "김민주")).toBe(false);
    });
    it("강사 줄의 `이영수 .이혜영` 은 학생 이름이 아니다 — 이혜영·이영수·이영 학생이 남의 수강증으로 통과하지 않는다", () => {
      expect(receiptHasName(named("김민수"), "이혜영")).toBe(false);
      expect(receiptHasName(named("김민수"), "이영수")).toBe(false);
      expect(receiptHasName(named("김민수"), "이영")).toBe(false);
      expect(receiptHasName(named("이혜영"), "이혜영")).toBe(true); // 진짜 이혜영 학생은 통과
    });
    it("화면 고정 글자(`최근본강의` · `수강신청`)도 이름이 아니다", () => {
      expect(receiptHasName(named("김민수"), "최근")).toBe(false);
      expect(receiptHasName(named("김민수"), "신청")).toBe(false);
      expect(receiptHasName(named("최근"), "최근")).toBe(true);
    });
    it("값이 다음 줄로 내려가도 읽고, 다음 줄이 다른 라벨이면 값이 아니다", () => {
      expect(receiptHasName("수강생\n김민수\n수강센터 부산 서면센터", "김민수")).toBe(true);
      expect(receiptHasName("수강생\n수강센터 부산 서면센터", "부산서면센터")).toBe(false);
      expect(receiptHasName("김민수\n수강센터 부산 서면센터", "김민수")).toBe(false); // 라벨이 없으면 통과시키지 않는다
    });
    it("값 뒤에 다음 칸 라벨이 한 줄로 붙어 읽혀도 이름까지만 본다 — 앞부분만 같은 남의 이름은 통과하지 않는다", () => {
      expect(receiptHasName("수강생 김민수 수강센터 부산 서면센터", "김민수")).toBe(true);
      expect(receiptHasName("수강생 김민수 수강센터 부산 서면센터", "김민")).toBe(false);
    });
    it("영문 이름은 대소문자·공백을 무시한다", () => {
      expect(receiptHasName("수강생 John Smith", "john smith")).toBe(true);
    });
  });

  it("점 날짜(2026.09.16)를 시각으로 오인해 망가뜨리지 않는다", () => {
    expect(normalizeReceiptText("수강기간 2026.09.16").text).toBe("수강기간 2026.09.16");
    const p = parseReceipt("현재시간 2026.09.16 19:27:43\n수강기간 2026.10.07");
    expect(p.capturedOn).toBe("2026-09-16");
    expect(p.capturedAt).toBe("2026-09-16T19:27:43");
    expect(p.months).toEqual([{ year: 2026, month: 10 }]); // 캡처 시각은 빼고
    expect(normalizeReceiptText("10.00 - 12.10").compact).toBe("10:00~12:10"); // 시각은 여전히 고친다
  });

  it("수강요일 줄 `[4주-09/04]` 의 개강일 달 — 배지를 못 읽었을 때 쓴다", () => {
    expect(parseReceipt("수강요일 [4주-09/04] 월수금 (월9회)").startMonth).toBe(9);
    expect(parseReceipt("수강요일 [4주-10.07] 주5일").startMonth).toBe(10);
    expect(parseReceipt(real).startMonth).toBeNull(); // 폭 700 판독은 `나주-98704]` 로 깨졌다 — 엉뚱한 달을 만들지 않는다
    expect(parseReceipt("12/25 모임").startMonth).toBeNull();
  });

  it("수강 방식의 근거 — 온라인 강의 · 호실 · 라이브방송 · 없음", () => {
    const base = ["역전토익 [종합반]", "650 목표", "수강센터 부산 서면센터", "수강요일 [4주-09/04] 월수금 (월9회)"];
    expect(parseReceipt([...base, "강의실 온라인 강의"].join("\n")).modeEvidence).toBe("online");
    expect(parseReceipt([...base, "강의실 본관 701호"].join("\n")).modeEvidence).toBe("room");
    expect(parseReceipt([...base.slice(0, 3), "수강요일 월수금 (월9회 라이브방송)"].join("\n")).modeEvidence).toBe("live");
    const none = parseReceipt(base.join("\n"));
    expect(none.modeEvidence).toBeNull();
    expect(none.mode).toBe("onsite");
  });

  it("과정명 레벨(중급속성 = 650)을 따로 돌려준다 — 숫자와 다르면 대조가 멈춘다", () => {
    const p = parseReceipt(screen(["역전토익 [프리미어반]", "750 목표 중급속성", "수강센터 부산 서면센터", "수강요일 주5일 (월18회) 프리미어반", "수강시간 10:00~13:40"].join("\n")));
    expect(p.level).toBe(750);
    expect(p.courseLevel).toBe(650);
  });
});
