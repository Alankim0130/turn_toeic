import { describe, expect, it } from "vitest";
import { matchBroadcasts, toBroadcasts, watchUrl, type LiveCandidate } from "./live-detect";

// 한국 시각 → ISO (UTC)
const kst = (hhmm: string) => new Date(`2026-10-07T${hhmm}:00+09:00`).toISOString();
const cand = (id: number, hhmm: string, instructor = "hy"): LiveCandidate => ({
  session_date_id: id,
  section_id: id * 10,
  instructor_id: instructor,
  starts_at: kst(hhmm),
  label: `${hhmm} 반`,
});
const live = (id: string, started: string | null) => ({ id, startedAt: started, lifeCycleStatus: "live" });
const NOW = new Date(kst("10:05"));

describe("방송 시작 시각 ±10분 = 그 회차 (Alan: 해당시간 5~10분 전후)", () => {
  it("10:00 수업에 09:55 에 켠 방송", () => {
    const r = matchBroadcasts([cand(1, "10:00")], [live("AAAAAAAAAAA", kst("09:55"))], NOW);
    expect(r[0].sessions.map((s) => s.session_date_id)).toEqual([1]);
  });
  it("10분 늦게 켜도 된다 (10:10)", () => {
    expect(matchBroadcasts([cand(1, "10:00")], [live("AAAAAAAAAAA", kst("10:10"))], NOW)[0].sessions).toHaveLength(1);
  });
  it("11분 넘게 벗어나면 넣지 않는다 (손으로 넣는다)", () => {
    expect(matchBroadcasts([cand(1, "10:00")], [live("AAAAAAAAAAA", kst("10:11"))], NOW)[0].sessions).toHaveLength(0);
    expect(matchBroadcasts([cand(1, "10:00")], [live("AAAAAAAAAAA", kst("09:49"))], NOW)[0].sessions).toHaveLength(0);
  });
  it("앞 교시 방송을 켜 둔 채 다음 교시가 되어도 그 방송은 다음 교시로 가지 않는다", () => {
    // 10:00 방송(09:58 시작)이 11:05 에도 켜져 있다 — 11:10 회차 후보가 있어도 넣지 않는다
    const r = matchBroadcasts([cand(2, "11:10")], [live("AAAAAAAAAAA", kst("09:58"))], new Date(kst("11:05")));
    expect(r[0].sessions).toHaveLength(0);
  });
  it("같은 강사·같은 시각 회차가 둘이면(합반) 둘 다 받는다", () => {
    const r = matchBroadcasts([cand(1, "10:00"), cand(2, "10:00")], [live("AAAAAAAAAAA", kst("10:01"))], NOW);
    expect(r[0].sessions.map((s) => s.session_date_id).sort()).toEqual([1, 2]);
  });
  it("라이브가 아닌 방송(준비·테스트·끝남)은 보지 않는다", () => {
    const r = matchBroadcasts([cand(1, "10:00")], [{ id: "AAAAAAAAAAA", startedAt: kst("10:00"), lifeCycleStatus: "testing" }], NOW);
    expect(r).toHaveLength(0);
  });
  it("시작 시각이 아직 비어 있으면 지금 시각으로 본다", () => {
    expect(matchBroadcasts([cand(1, "10:00")], [live("AAAAAAAAAAA", null)], NOW)[0].sessions).toHaveLength(1);
  });
  it("한 회차에는 방송 하나만 — 두 방송이 같은 창에 있으면 먼저 온 것", () => {
    const r = matchBroadcasts([cand(1, "10:00")], [live("AAAAAAAAAAA", kst("09:58")), live("BBBBBBBBBBB", kst("10:02"))], NOW);
    expect(r.flatMap((x) => x.sessions)).toHaveLength(1);
    expect(r[0].sessions).toHaveLength(1);
    expect(r[1].sessions).toHaveLength(0);
  });
});

describe("유튜브 응답 읽기", () => {
  it("id · 시작 시각 · 상태를 꺼내고 모양이 이상한 것은 버린다", () => {
    const json = {
      items: [
        { id: "AAAAAAAAAAA", snippet: { actualStartTime: "2026-10-07T00:58:00Z" }, status: { lifeCycleStatus: "live" } },
        { id: "bad id!", status: { lifeCycleStatus: "live" } },
        { snippet: {}, status: {} },
      ],
    };
    expect(toBroadcasts(json)).toEqual([{ id: "AAAAAAAAAAA", startedAt: "2026-10-07T00:58:00Z", lifeCycleStatus: "live" }]);
  });
  it("items 가 없으면 빈 목록 (오류 응답)", () => {
    expect(toBroadcasts({ error: { code: 401 } })).toEqual([]);
  });
  it("링크는 watch 주소 한 가지로 — 다시보기로도 같은 주소를 쓴다", () => {
    expect(watchUrl("AAAAAAAAAAA")).toBe("https://www.youtube.com/watch?v=AAAAAAAAAAA");
  });
});
