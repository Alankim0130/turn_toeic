/**
 * 등업신청의 이름 불일치 안내 (2026-09-30 Alan — "등업신청에서 수강증의 이름과 내 이름이 일치하지 않으면 등업신청에서 팝업 안내가
 * 하나 들어가면 좋겠어. 수강증의 이름과 일치해서 넣어주세요").
 *
 * 이름이 다르면 **거절하지 않는다** — OCR 이 한 글자를 잘못 읽었거나 아이콘이 이름을 가렸을 수 있다 (게이트 G3 는 자동 승인만 막는다).
 * 대신 학생에게 수강증에서 읽은 이름과 가입한 이름을 나란히 보여 주고 무엇을 하면 되는지 알린다. 수강증은 그대로 접수돼 선생님이 본다.
 *
 * **팝업은 이름을 또렷이 읽었을 때만** 띄운다 (`receiptStudentName` 이 한글 2~5자를 읽음). 라벨을 못 읽었으면 "다르다" 고 말할 근거가 없다.
 * 가입 이름이 한글이 아니면(외국 이름) 비교하지 않는다 — 수강증 칸은 한글로만 읽는다.
 * 가입 이름의 오타는 **등업 전까지** 학생이 내 정보(/my/profile)에서 고칠 수 있다 (2026-10-02 Alan, `can_rename_self`) —
 * 고치면 이름 때문에 멈춘 수강증을 다시 본다 (`rename-recheck.ts`). 등업 뒤에는 선생님이 고친다 (CLAUDE.md 도메인 규칙 3-1).
 */
export type NameMismatch = { receiptName: string; myName: string };

const hangul = (s: string | null | undefined) => (s ?? "").normalize("NFKC").replace(/\s+/g, "");

export function nameMismatchOf(
  nameMatches: boolean | null | undefined,
  receiptName: string | null | undefined,
  myName: string | null | undefined,
): NameMismatch | undefined {
  if (nameMatches !== false || !receiptName || !myName) return undefined;
  const mine = hangul(myName);
  if (!/^[가-힣]{2,}$/.test(mine)) return undefined;
  if (hangul(receiptName) === mine) return undefined; // 같은 이름을 읽었다 — 다르다고 말하지 않는다
  return { receiptName: hangul(receiptName), myName: mine };
}
