import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffPostForm } from "@/components/admin/board/StaffPostForm";
import { requireCrew } from "@/lib/auth";
import { STAFF_BOARD_TESTING_NOTE } from "@/lib/staff-board";

export const metadata: Metadata = { title: "글쓰기 · 직원 게시판", robots: { index: false } };

/** 직원 게시판 글쓰기 (2026-10-21) — 강사 · 관리자 · 조교. 편집기는 수업자료실 공지와 같다 (굵게 · 색 · 표 · 사진 · 워드 붙여 넣기) */
export default async function NewStaffPostPage() {
  // 레이아웃이 조교를 통과시키므로 화면마다 막는다 — 이 화면은 조교에게 열려 있다
  const { profile } = await requireCrew();
  return (
    <>
      <PageHeader icon="offline" title="글쓰기" description="직원 게시판에 올라가요. 강사 · 관리자 · 조교만 보고, 학생에게는 보이지 않아요." />
      {profile.test_role ? <p className="card p-5 text-sm text-slate">{STAFF_BOARD_TESTING_NOTE}</p> : <StaffPostForm imageUrls={{}} back="/admin/board" />}
    </>
  );
}
