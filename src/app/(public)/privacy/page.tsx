import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { RETENTION_LABEL } from "@/lib/receipt-retention";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "역전토익 수강생 학습관리 사이트가 어떤 개인정보를 왜 모으고, 얼마나 보관하며, 어떻게 지키는지 알려드립니다.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "개인정보처리방침 | 역전토익",
    description: "역전토익 사이트의 개인정보 수집·이용·보관·보호 기준.",
    url: "/privacy",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "역전토익" }],
  },
};

/** 시행일 — 내용을 고치면 날짜도 올린다 */
const EFFECTIVE = "2026년 10월 30일";

/**
 * 개인정보처리방침 (2026-10-01). 구글 OAuth 동의 화면을 프로덕션으로 게시하려면 개인정보처리방침 주소가 있어야 해서 만들었고,
 * 실명·휴대폰·수강증을 받는 사이트라 어차피 있어야 할 문서다. **실제로 하는 것만 적는다** — CLAUDE.md 와 어긋나면 문서가 거짓말이 된다.
 * 수강증 보관 기간은 `RETENTION_LABEL` 한곳에서 읽는다 (등업신청 화면의 고지와 같은 값).
 * 유튜브 항목은 Google API 서비스 사용자 데이터 정책(제한적 사용)과 YouTube API 서비스 약관이 요구하는 고지다 — 지우지 말 것.
 * 2026-10-04 사실과 어긋난 곳을 고쳤다 — 6항 이름은 등업 전 본인이 고친다(10-02) · 1항 직접 올린 프로필 사진(10-02) ·
 * 2·5항 유튜브 송출은 불라방 링크에도 들어간다(10-01 저녁) · 8항 조교도 수강증 · 숙제 사진을 본다(09-19 · 10-03) · 비대면 스터디 인증 사진도(10-08 — 비대면스터디 인증 게시판). 기능이 바뀌면 여기도 본다.
 * 2026-10-07 불라방 교재 현장수령 — 1 · 2항에 받으러 올 날짜 · 시각(택배면 주소)을 더했다.
 * 같은 날 숙제 음성 파일 — 1 · 4 · 8항의 숙제 사진 옆에 음성 파일을 더했다 (보관 · 보는 사람은 숙제 사진과 같다).
 * 2026-10-08 3주차 모의고사 특강의 YBM 수강후기 링크 — 1 · 2항에 더했다 (강사 · 관리자가 신청 명단에서 열어 본다).
 * 2026-10-15 특강 신청 조건을 강사가 특강마다 고른다 — 후기 링크에 더해 인스타그램 새로 · 기존 팔로우를 1 · 2항에 더했다 (유튜브 구독은 체크만 하고 남기지 않는다).
 * 2026-10-15 학생 휴대폰 알림(불라방 시작 · 숙제 미제출) — 1항의 기기 정보를 학생까지 넓혀 따로 적고, 2 · 3 · 4항(푸시 서비스를 거친다)에 더했다.
 * 2026-10-16 특강을 신청할 때 신청 방식(현장 · 수업영상 받기 · 시험지 수령 · PDF 수령)을 고른다 — 1 · 2항에 더했다.
 * 2026-10-28 수강생 설문(등업 직후 한 번 — OT 종이 설문을 웹으로) — 1 · 2 · 8항에 더했다. 나이는 받지 않는다(다 써야 넘어가는 설문이라 필요 없는 정보를 받지 않는다 —
 * 개인정보 보호법 제16조 제3항). 비워도 되는 칸(직장명 · LC/RC · 소개해 준 분 이름)을 적었다. 보는 사람은 강사 · 관리자뿐이다(조교 아님).
 */
export default function PrivacyPage() {
  return (
    <section className="container-x py-10 sm:py-14">
      <PageHeader icon="lock" title="개인정보처리방침" description={`${site.name}(${site.academy.name}) 수강생 학습관리 사이트 · 시행일 ${EFFECTIVE}`} />

      <div className="mx-auto max-w-3xl space-y-5">
        <Article title="1. 어떤 정보를 모으나">
          <dl className="space-y-3">
            <Item term="회원가입 (이메일)">이메일, 비밀번호(암호화해 저장), 실명, 휴대폰 번호. 대학·학과·성별은 선택이며 안 적어도 가입됩니다.</Item>
            <Item term="간편 로그인 (구글 · 카카오)">그 서비스가 넘겨 주는 이메일, 표시 이름, 프로필 사진 주소. 실명과 휴대폰 번호는 첫 로그인 뒤 가입 완료 화면에서 따로 받습니다.</Item>
            <Item term="등업신청">YBM 수강증 화면 캡처 이미지(수강생 이름 · 강좌 · 수강 기간 · 시간이 적혀 있습니다)와 이름 · 전화번호 확인값. 수강증은 서버 안에서 자동으로 읽어 반을 맞추며 바깥 서비스로 보내지 않습니다.</Item>
            <Item term="수강생 설문 (등업 직후 한 번)">
              지금 하는 일(직장인이면 직장명, 선택), 지금 토익 점수와 목표 점수 · 기간, 토익을 공부하는 이유, 지금까지의 공부와 들었던 수업, 다음 달 수강 예정과 생각 중인 반(안 들으면 그 이유),
              숙제 관리 방식, 역전토익을 알게 된 계기(지인 소개면 그분 이름, 선택). 나이는 받지 않습니다. 지금 점수와 목표는 마이페이지에서 언제든 고칠 수 있습니다.
            </Item>
            <Item term="프로필 사진 (선택)">마이페이지의 내 정보에서 직접 올린 사진. 새 사진을 올리거나 지우면 예전 사진 파일은 바로 지웁니다.</Item>
            <Item term="수강생 기능을 쓰는 동안">반 배정과 등록 기간, 출석(찍은 시각), 숙제 사진 · 음성 파일(2026년 10월 30일 전에 낸 숙제는 함께 적은 질문 글도), 비대면 스터디 인증 사진과 메모, 스터디 · 특강 신청(특강은 고른 신청 방식 — 현장 · 수업영상 받기 · 시험지 수령 · PDF 수령, 신청 조건이 있는 특강은 신청할 때 올린 YBM 수강후기 링크, 역전토익 인스타그램을 새로 팔로우했는지 원래 팔로우하고 있었는지), 불라방 교재 주문(받는 분 이름 · 연락처 · 입금자명, 택배면 주소 · 학원에서 직접 받으면 받으러 올 날짜 · 시각), 숙제 미제출 알림을 받지 않겠다고 한 기록(알림 안 받기), 알림함 읽음 여부.</Item>
            <Item term="문의 남기기 (비회원 포함)">이름, 이메일 또는 전화번호, 문의 내용.</Item>
            <Item term="저절로 남는 것">로그인 세션 쿠키, 마지막 접속 시각.</Item>
            <Item term="휴대폰 알림을 켠 경우">그 기기의 알림 주소(웹 푸시 구독 정보)와 브라우저 정보. 강사 · 관리자는 관리자 알림, 학생은 불라방 시작 · 숙제 미제출 알림을 받기 위해 직접 켠 경우에만 남습니다.</Item>
            <Item term="강사 계정의 유튜브 연결">강사가 직접 연결한 유튜브 채널의 ID · 이름과, 진행 중인 방송 목록을 읽기 위한 접근 토큰. 읽기 권한만 받으며 영상을 올리거나 지우지 않습니다.</Item>
          </dl>
        </Article>

        <Article title="2. 왜 쓰나">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>수강생인지 확인하고 반을 배정하기 위해 (수강증과 가입 실명을 대조합니다).</li>
            <li>내 시간표 · 불라방 · 다시보기 · 숙제 · 출석 · 스터디 · LC 음원 등 학습 관리 기능을 제공하기 위해.</li>
            <li>불라방 교재를 보내 드리거나 학원에서 건네 드리기 위해 (배송지 또는 받으러 올 날짜 · 시각, 연락처).</li>
            <li>특강을 고른 신청 방식대로 준비하기 위해 (현장 자리 · 수업영상 · 시험지 · PDF).</li>
            <li>특강의 신청 조건(YBM 수강후기 작성 · 역전토익 유튜브 구독 · 인스타그램 팔로우)을 확인하기 위해 (강사가 신청 명단에서 올린 후기 링크를 열어 보고, 인스타그램을 새로 팔로우했는지 봅니다).</li>
            <li>문의에 답하고, 수업 시작 · 숙제 점검 · 숙제 미제출 · 결석 같은 안내를 사이트 안 알림함으로 보내기 위해 (불라방 시작 · 숙제 미제출은 알림을 켠 휴대폰으로도 보냅니다).</li>
            <li>수강생 설문은 선생님이 수업 수준과 숙제 관리를 맞추는 데 씁니다. 고른 숙제 관리 방식대로 숙제 미제출 알림을 켜거나 끄고, 수강 계기는 개인을 가리지 않는 집계 통계에도 씁니다.</li>
            <li>대학 · 학과 · 성별은 개인을 가리지 않는 집계 통계(어느 학교 학생이 많은지 등)에만 씁니다.</li>
            <li>강사의 유튜브 연결은 Zoom 수업을 유튜브로 함께 송출한 방송을 찾아 그 회차의 불라방 링크와 다시보기에 연결하는 데만 씁니다.</li>
          </ul>
        </Article>

        <Article title="3. 얼마나 보관하나">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b className="text-ink">수강증 원본 이미지</b>는 등업 판정이 끝나고 <b className="text-ink">{RETENTION_LABEL}</b>이 지나면 자동으로 지웁니다. 어떤 반에 배정됐는지의 판정 기록은 남깁니다.
            </li>
            <li>회원 정보와 학습 기록은 회원이 삭제를 요청하면 지체 없이 지웁니다. 관계 법령이 보존을 요구하는 항목은 그 기간 동안만 따로 보관합니다.</li>
            <li>강사의 유튜브 접근 토큰은 연결을 끊는 즉시 지우고, 구글 쪽 권한도 함께 거둡니다.</li>
            <li>문의 내용은 답변이 끝난 뒤에도 같은 문의를 되짚기 위해 보관하며, 요청하면 지웁니다.</li>
            <li>휴대폰 알림 기기 정보는 그 기기에서 알림을 끄거나, 기기 · 브라우저가 알림 주소를 없애 보낼 수 없게 되면 지웁니다.</li>
          </ul>
        </Article>

        <Article title="4. 다른 곳에 주나">
          <p>개인정보를 다른 회사나 사람에게 팔거나 넘기지 않습니다. 수사기관 등이 법령에 따라 정당하게 요구할 때만 예외입니다.</p>
          <p className="mt-3">
            다만 사이트를 운영하기 위해 아래 서비스에 보관 · 처리를 맡깁니다. 서버가 한국 밖에 있을 수 있어 그 범위에서 국외로 옮겨집니다.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><b className="text-ink">Supabase, Inc.</b> — 데이터베이스 · 파일(수강증 · 숙제 사진과 음성 등) 보관 · 로그인 인증.</li>
            <li><b className="text-ink">Vercel Inc.</b> — 웹사이트 호스팅과 자동 처리(수강증 보관 기간 정리 등).</li>
            <li><b className="text-ink">Google LLC</b> — 구글 간편 로그인, 강사 유튜브 채널 연결(YouTube Data API).</li>
            <li><b className="text-ink">Kakao Corp.</b> — 카카오 간편 로그인, 카카오톡 채널 상담(카카오톡 안에서 이뤄지며 이 사이트에는 남지 않습니다).</li>
          </ul>
          <p className="mt-3">
            휴대폰 알림을 켠 경우, 알림은 그 기기의 푸시 서비스(안드로이드 · 크롬은 Google, 아이폰은 Apple 등)를 거쳐 전달됩니다. 알림 내용은 암호화되어 그 서비스가 읽을 수
            없습니다.
          </p>
        </Article>

        <Article title="5. 구글 · 유튜브 데이터에 관한 고지">
          <p>
            {site.name}이 Google API 로부터 받은 정보의 사용과 이전은{" "}
            <Ext href="https://developers.google.com/terms/api-services-user-data-policy">Google API 서비스 사용자 데이터 정책</Ext>(제한적 사용 요건 포함)을 따릅니다.
          </p>
          <p className="mt-3">
            강사가 유튜브 채널을 연결하면 YouTube API 서비스를 통해 <b className="text-ink">진행 중인 방송 목록만</b> 읽습니다. 그 정보는 수업 회차에 불라방 링크와 다시보기를 연결하는 데만 쓰고,
            사람이 열람하거나 광고 · 판매 · 제3자 이전에 쓰지 않으며, 연결을 끊으면 바로 지웁니다. 이 이용은{" "}
            <Ext href="https://www.youtube.com/t/terms">YouTube 서비스 약관</Ext>과 <Ext href="https://policies.google.com/privacy">Google 개인정보처리방침</Ext>의 적용을 받습니다.
            연결은 사이트의 유튜브 자동 연결 화면이나 <Ext href="https://myaccount.google.com/permissions">Google 계정의 보안 설정</Ext>에서 언제든 끊을 수 있습니다.
          </p>
        </Article>

        <Article title="6. 내 정보에 대한 권리">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>언제든 내 정보를 열람 · 정정 · 삭제하거나 처리 정지를 요구할 수 있습니다. 휴대폰 번호 같은 일부 항목은 마이페이지에서 직접 고칠 수 있습니다.</li>
            <li>실명은 수강증 대조의 기준이라 등업 전에만 마이페이지의 내 정보에서 직접 고칠 수 있고, 등업한 뒤에는 선생님께 수정을 요청합니다.</li>
            <li>계정 삭제를 비롯한 요청은 <Link href="/contact/inquiry" className="font-bold text-brand-600 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">문의 남기기</Link>로 주시면 확인 뒤 처리합니다.</li>
          </ul>
        </Article>

        <Article title="7. 쿠키">
          <p>
            로그인 상태를 유지하는 세션 쿠키만 씁니다. 광고 · 추적 쿠키는 쓰지 않습니다. 첫 화면의 소개 영상은 재생 버튼을 누를 때만 유튜브(youtube-nocookie.com)를 불러옵니다.
          </p>
        </Article>

        <Article title="8. 어떻게 지키나">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>모든 통신은 암호화(HTTPS)하고 비밀번호는 복원할 수 없는 형태로만 저장합니다.</li>
            <li>수강증 · 숙제 사진과 음성 · 프로필 사진 같은 파일은 비공개 저장소에 두고 본인과 강사 · 관리자만 볼 수 있도록 접근을 제한합니다. 수강증은 등업 확인을, 숙제 사진과 음성은 숙제 점검을, 비대면 스터디 인증 사진은 스터디 운영을 돕는 조교도 봅니다.</li>
            <li>수강증 원본은 보관 기간이 지나면 자동으로 지웁니다. 수강증을 읽는 작업은 서버 안에서만 하고 바깥 서비스로 보내지 않습니다.</li>
            <li>수강생 설문의 답은 본인과 강사 · 관리자만 볼 수 있습니다. 조교는 볼 수 없습니다.</li>
          </ul>
        </Article>

        <Article title="9. 문의처">
          <p>
            개인정보 보호책임자: {site.name} 운영자 ({site.academy.name}, {site.academy.address})
            <br />
            문의: <Link href="/contact/inquiry" className="font-bold text-brand-600 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">문의 남기기</Link> 또는 학원 데스크
          </p>
          <p className="mt-3 text-xs text-mist">이 방침은 {EFFECTIVE}부터 적용됩니다. 내용이 바뀌면 이 페이지에 바뀐 날짜와 함께 올립니다.</p>
        </Article>
      </div>
    </section>
  );
}

function Article({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="card p-6 text-sm leading-relaxed text-slate">
      <h2 className="text-lg font-black text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </article>
  );
}

function Item({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-bold text-ink">{term}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-600 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
      {children}
    </a>
  );
}
