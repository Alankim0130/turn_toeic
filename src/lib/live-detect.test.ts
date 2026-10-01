import { describe, expect, it } from "vitest";
import { matchBroadcasts, streamState, toBroadcasts, watchUrl, type LiveCandidate } from "./live-detect";

// 한국 시각 → ISO (UTC)
const kst = (hhmm: string) => new Date(`2026-10-07T${hhmm}:00+09:00`).toISOString();
const cand = (id: number, hhmm: string, instructor = "hy"): LiveCandidate => ({
  session_date_id: id,
  section_id: id * 10,
  instructor_id: instructor,
  starts_at: kst(hhmm),
  label: `${hhmm} 반`,
});
const live = (id: string, started: string | null) => ({ id, startedAt: started, lifeCycleStatus: "live", title: "", privacy: null });
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
    const r = matchBroadcasts([cand(1, "10:00")], [{ id: "AAAAAAAAAAA", startedAt: kst("10:00"), lifeCycleStatus: "testing", title: "", privacy: null }], NOW);
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
  it("id · 시작 시각 · 상태 · 제목 · 공개 범위를 꺼내고 모양이 이상한 것은 버린다", () => {
    const json = {
      items: [
        {
          id: "AAAAAAAAAAA",
          snippet: { actualStartTime: "2026-10-07T00:58:00Z", title: "650 RC 10:00" },
          status: { lifeCycleStatus: "live", privacyStatus: "unlisted" },
        },
        { id: "bad id!", status: { lifeCycleStatus: "live" } },
        { snippet: {}, status: {} },
      ],
    };
    expect(toBroadcasts(json)).toEqual([
      { id: "AAAAAAAAAAA", startedAt: "2026-10-07T00:58:00Z", lifeCycleStatus: "live", title: "650 RC 10:00", privacy: "unlisted" },
    ]);
  });
  it("제목·공개 범위가 없어도 방송은 버리지 않는다 (Zoom 이 만든 방송도 있다)", () => {
    const [b] = toBroadcasts({ items: [{ id: "AAAAAAAAAAA", status: { lifeCycleStatus: "live" } }] });
    expect(b).toMatchObject({ id: "AAAAAAAAAAA", title: "", privacy: null });
  });
  it("items 가 없으면 빈 목록 (오류 응답)", () => {
    expect(toBroadcasts({ error: { code: 401 } })).toEqual([]);
  });
  it("링크는 watch 주소 한 가지로 — 다시보기로도 같은 주소를 쓴다", () => {
    expect(watchUrl("AAAAAAAAAAA")).toBe("https://www.youtube.com/watch?v=AAAAAAAAAAA");
  });
});

describe("오늘 회차 상태 칩 (유튜브 자동 연결 화면) — 2026-10-01 송출은 불라방 링크가 아니라 다시보기로", () => {
  const base = { recorded: false, liveToReplay: true, stream: null, hasReplay: false, connected: true };
  const stream = { detected_at: "2026-10-07T01:02:00Z", promoted_at: null };

  it("인강 반은 방송이 없다 — 다른 무엇보다 먼저", () => {
    expect(streamState({ ...base, recorded: true, stream }).tone).toBe("recorded");
  });
  it("다시보기를 만들지 않는 반(저녁)은 채널이 연결돼 있어도 기다리지 않는다", () => {
    expect(streamState({ ...base, liveToReplay: false })).toMatchObject({ tone: "muted", text: "다시보기를 만들지 않는 반" });
  });
  it("송출이 잡히면 끝나면 다시보기로 — 잡힌 시각을 함께", () => {
    expect(streamState({ ...base, stream })).toMatchObject({ tone: "caught", at: stream.detected_at, text: "송출 잡힘 — 끝나면 다시보기로" });
  });
  it("비어 있던 불라방 링크에도 들어갔으면 그렇게 적는다 (2026-10-01 Alan — 불라방도 유튜브 링크로)", () => {
    expect(streamState({ ...base, stream, liveLinked: true })).toMatchObject({ tone: "caught", text: "송출 잡힘 · 불라방 연결 — 끝나면 다시보기로" });
  });
  it("승격되면 다시보기 올라감 — 올라간 시각을 함께", () => {
    const promoted = { ...stream, promoted_at: "2026-10-07T02:10:00Z" };
    expect(streamState({ ...base, stream: promoted, hasReplay: true })).toMatchObject({ tone: "done", at: promoted.promoted_at });
  });
  it("송출 없이 다시보기만 있으면 직접 등록한 것", () => {
    expect(streamState({ ...base, hasReplay: true }).tone).toBe("manual");
  });
  it("채널이 연결돼 있으면 기다리는 중, 아니면 미연결", () => {
    expect(streamState(base).tone).toBe("wait");
    expect(streamState({ ...base, connected: false })).toMatchObject({ tone: "muted", text: "채널 미연결" });
  });
});
