"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateMyProfile, type AccountState } from "../account/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { FormError, GenderField, NameField, PhoneField, SchoolFields } from "@/app/(auth)/ProfileFields";

type ProfileValues = { name: string; phone: string; university: string; department: string; gender: string };

/**
 * 내 정보 폼. 칸은 회원가입·가입 정보 입력과 같은 컴포넌트(`ProfileFields`)를 쓴다 — 문구·검사 규칙이 어긋나지 않게.
 * 실명은 `canRename` 일 때만 열린다 (등업 전). 잠겼으면 읽기 전용으로 보여 주고 문의 길을 적는다.
 */
export function ProfileForm({ profile, canRename, suggestedName }: { profile: ProfileValues; canRename: boolean; suggestedName?: string }) {
  const [state, action] = useActionState<AccountState, FormData>(updateMyProfile, {});
  const suggest = canRename && suggestedName && suggestedName.replace(/\s/g, "") !== profile.name.replace(/\s/g, "") ? suggestedName : undefined;

  return (
    <form action={action} className="space-y-4">
      <FormError error={state.error} stateKey={state} />
      {state.message && (
        <Alert kind="success">
          {state.message}
          {state.approved && (
            <>
              {" "}
              <Link href="/my/class" className="font-bold underline">내 시간표 보기</Link>
            </>
          )}
        </Alert>
      )}
      {suggest && (
        <Alert kind="info">
          수강증에서 읽은 이름 <b>{suggest}</b> 을(를) 이름 칸에 넣어 뒀어요. 맞는지 확인하고 저장해 주세요.
        </Alert>
      )}

      <NameField
        defaultValue={suggest ?? profile.name}
        readOnly={!canRename}
        lockedNote={
          <>
            등업이 끝난 뒤에는 이름을 직접 바꿀 수 없어요. 틀렸다면{" "}
            <Link href="/contact/inquiry" className="font-bold underline">선생님께 문의</Link>해 주세요.
          </>
        }
      />
      {canRename && <p className="-mt-2 text-xs text-mist">수강증에 적힌 실명과 같아야 등업이 돼요. 등업 전까지는 여기서 바로 고칠 수 있어요.</p>}
      <PhoneField defaultValue={profile.phone} />
      <SchoolFields university={profile.university} department={profile.department} />
      <GenderField defaultValue={profile.gender} />

      <SubmitButton pendingText="저장 중…">저장</SubmitButton>
    </form>
  );
}
