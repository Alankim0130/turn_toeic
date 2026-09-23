/**
 * 한 번에 하나씩만 돌리는 줄 — 수강증 OCR 워커를 여러 요청이 나눠 쓸 때 쓴다 (2026-09-22, `src/lib/ocr.ts`).
 *
 * 왜 필요한가: Vercel 은 한 인스턴스에서 요청 여러 개를 동시에 돌린다(Fluid Compute). tesseract.js 워커는 한 번에 한 장만 읽어서
 * 나머지 요청은 그 뒤에 줄을 서는데, 줄 선 시간까지 30초 타임아웃에 들어가 **교실에서 여럿이 한꺼번에 올리면 뒤 사람이 시간 초과**가 났다.
 * 게다가 시간 초과가 난 요청이 워커를 죽이면 **같은 워커를 기다리던 다른 요청은 영영 끝나지 않고**(tesseract.js 는 죽은 워커의 작업을
 * 끝내 주지 않는다 — 실측), 그 요청들이 30초 뒤 저마다 다시 워커를 죽여 **새로 만든 워커까지** 연쇄로 죽었다.
 *
 * 그래서 줄을 앱에서 직접 세운다:
 *  - 작업은 한 번에 하나다. 작업 시간 제한은 **자기 차례가 온 뒤부터** 센다 (부르는 쪽이 작업 안에서 잰다).
 *  - 차례를 `maxWaitMs` 넘게 기다리면 포기한다 (`QueueBusyError`) — 함수 제한 시간(60초) 안에 답을 돌려줘야 한다.
 *  - 포기한 자리는 차례가 오면 바로 넘긴다 — 한 사람이 포기했다고 줄이 멈추지 않는다.
 *  - 작업이 실패해도 차례는 넘긴다.
 * 차례를 쥔 작업만 워커를 만지므로, 워커를 죽이고 새로 만드는 것도 그 작업 안에서만 안전하다.
 */

export class QueueBusyError extends Error {
  constructor() {
    super("ocr_busy");
    this.name = "QueueBusyError";
  }
}

export type SerialQueue = <T>(task: () => Promise<T>, maxWaitMs: number) => Promise<T>;

export function createSerialQueue(): SerialQueue {
  // 줄의 끝. 늘 성공으로 끝나는 promise 만 이어 붙인다 — 앞 작업의 실패가 뒤로 번지지 않게
  let tail: Promise<void> = Promise.resolve();

  return async function run<T>(task: () => Promise<T>, maxWaitMs: number): Promise<T> {
    const prev = tail;
    let release!: () => void;
    const mine = new Promise<void>((resolve) => (release = resolve));
    tail = prev.then(() => mine);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const myTurn = await Promise.race([
      prev.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), Math.max(0, maxWaitMs));
      }),
    ]);
    clearTimeout(timer);

    if (!myTurn) {
      // 기다리다 포기했다 — 내 차례가 오면 곧바로 다음 사람에게 넘긴다
      void prev.then(release);
      throw new QueueBusyError();
    }
    try {
      return await task();
    } finally {
      release();
    }
  };
}
