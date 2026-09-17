import { describe, expect, it } from "vitest";
import { caretAfterFormat, digitsOnly, editPhone, formatPhone } from "./phone";

describe("formatPhone — 휴대폰 번호 하이픈", () => {
  it("010 은 3-4-4", () => {
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
  });

  it("옛 10자리 번호(011·016~019)는 3-3-4", () => {
    expect(formatPhone("0111234567")).toBe("011-123-4567");
    expect(formatPhone("0191234567")).toBe("019-123-4567");
  });

  it("010 은 10자리가 돼도 3-4-4 를 지킨다 — 한 자 지웠다고 통째로 밀리면 고쳐 쓰기 어렵다", () => {
    expect(formatPhone("0101234567")).toBe("010-1234-567");
  });

  it("치는 도중에도 끊어 준다", () => {
    expect(formatPhone("0")).toBe("0");
    expect(formatPhone("010")).toBe("010");
    expect(formatPhone("0101")).toBe("010-1");
    expect(formatPhone("0101234")).toBe("010-1234");
    expect(formatPhone("01012345")).toBe("010-1234-5");
  });

  it("이미 하이픈이 있어도 같은 결과 — 두 번 그려도 흔들리지 않는다", () => {
    expect(formatPhone("010-1234-5678")).toBe("010-1234-5678");
    expect(formatPhone(formatPhone("01012345678"))).toBe("010-1234-5678");
  });

  it("공백·괄호 같은 글자는 버린다", () => {
    expect(formatPhone(" 010 1234 5678 ")).toBe("010-1234-5678");
    expect(formatPhone("(010)1234.5678")).toBe("010-1234-5678");
  });

  it("11자리를 넘으면 버린다 — 나라번호가 딸려 와도 칸이 넘치지 않게", () => {
    expect(formatPhone("821012345678999")).toBe("821-0123-4567");
  });

  it("빈 값은 빈 값", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("abc")).toBe("");
  });
});

describe("digitsOnly — 저장되는 값", () => {
  it("하이픈을 도로 떼면 서버가 받는 값과 같다", () => {
    expect(digitsOnly("010-1234-5678")).toBe("01012345678");
    expect(/^01\d{8,9}$/.test(digitsOnly(formatPhone("01012345678")))).toBe(true);
    expect(/^01\d{8,9}$/.test(digitsOnly(formatPhone("0111234567")))).toBe(true);
  });

  it("길이는 자르지 않는다 — 자르는 것은 formatPhone 의 몫", () => {
    expect(digitsOnly("821012345678")).toBe("821012345678");
  });
});

describe("caretAfterFormat — 커서 자리", () => {
  it("앞에 있던 숫자 개수만큼 지나간 자리", () => {
    expect(caretAfterFormat("010-1234-5678", 0)).toBe(0);
    expect(caretAfterFormat("010-1234-5678", 3)).toBe(3);
    expect(caretAfterFormat("010-1234-5678", 4)).toBe(5);
    expect(caretAfterFormat("010-1234-5678", 11)).toBe(13);
  });

  it("숫자가 모자라면 끝", () => {
    expect(caretAfterFormat("010", 9)).toBe(3);
  });
});

describe("editPhone — 한 번의 입력", () => {
  it("끝에 이어 치면 커서도 끝에 남는다", () => {
    expect(editPhone("0101", 4, "010", false)).toEqual({ value: "010-1", caret: 5 });
    expect(editPhone("010-12345678", 12, "010-1234567", false)).toEqual({ value: "010-1234-5678", caret: 13 });
  });

  it("가운데를 고쳐도 커서가 끝으로 튀지 않는다", () => {
    // `010-1234-567` 의 넷째 숫자 앞에 9 를 끼워 넣었다 (브라우저에서 확인한 실제 입력)
    expect(editPhone("010-91234-567", 5, "010-1234-567", false)).toEqual({ value: "010-9123-4567", caret: 5 });
    // 이미 11자리인 칸은 `maxLength` 가 열두 번째 글자를 막아 여기까지 오지 않지만,
    // 붙여넣기처럼 넘쳐 들어오면 뒤를 버린다
    expect(editPhone("010-91234-5678", 5, "010-1234-5678", false)).toEqual({ value: "010-9123-4567", caret: 5 });
  });

  it("하이픈을 지우면 앞의 숫자가 지워진다 — 안 그러면 하이픈이 되살아나 안 지워지는 것처럼 보인다", () => {
    // `010-1234-5678` 에서 커서가 하이픈 뒤(4)에 있을 때 백스페이스 → 브라우저가 하이픈을 지운 상태로 들어온다
    expect(editPhone("0101234-5678", 3, "010-1234-5678", true)).toEqual({ value: "011-234-5678", caret: 2 });
  });

  it("숫자를 지운 것은 그대로 지운다", () => {
    expect(editPhone("010-1234-567", 12, "010-1234-5678", true)).toEqual({ value: "010-1234-567", caret: 12 });
    expect(editPhone("010-1234-5", 10, "010-1234-56", true)).toEqual({ value: "010-1234-5", caret: 10 });
  });

  it("맨 앞에서 백스페이스를 눌러도 멀쩡하다", () => {
    expect(editPhone("010-1234-5678", 0, "010-1234-5678", true)).toEqual({ value: "010-1234-5678", caret: 0 });
  });

  it("통째로 지우면 빈 값", () => {
    expect(editPhone("", 0, "010-1234-5678", true)).toEqual({ value: "", caret: 0 });
  });

  it("붙여넣기도 표기로 바뀐다", () => {
    expect(editPhone("010 1234 5678", 13, "", false)).toEqual({ value: "010-1234-5678", caret: 13 });
  });
});
