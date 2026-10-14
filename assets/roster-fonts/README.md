# 반별 명단 PDF 글꼴

`roster-bold.ttf` 는 **Pretendard 1.3.9 Bold** 에서 한글 완성형 11,172자 전부와 영문 · 숫자 · 기호만 남긴 파일이다
(`scripts/roster-font.mjs`). 학생명단의 반별 명단 PDF(`src/lib/class-roster-pdf.ts`)에 넣어 인쇄할 때만 쓴다 —
사이트 화면의 글꼴은 여전히 CDN 의 Pretendard 다.

포스터 글꼴(`assets/poster-fonts/`)과 달리 글자를 고를 수 없다 — 학생 이름은 어떤 글자든 올 수 있다.
**글리프 길이를 짝수로 맞춰 둔 파일이다** — 그대로의 Pretendard 를 넣으면 pdf-lib 이 글자를 잘라 넣을 때 모양이 밀려 이름이 빈칸으로 찍힌다
(까닭은 스크립트 머리말). 다시 만들 때도 스크립트로 만든다. `class-roster-pdf.test.ts` 가 홀수 길이 글리프 · 빠진 한글을 잡는다.

## 라이선스

Pretendard — Copyright © 2021–2023 Kil Hyung-jin (https://github.com/orioncactus/pretendard), with Reserved Font Name "Pretendard".
Inter · Source Han Sans · M PLUS 1p 에서 파생된 부분은 각 저작권자의 것이다.

이 글꼴은 **SIL Open Font License 1.1** 로 배포된다 — https://openfontlicense.org/open-font-license-official-text/
글꼴 파일을 따로 팔 수 없고, 이 라이선스와 저작권 표시를 함께 두어야 한다. 이 폴더의 파일은 줄인(부분) 파일이라
글꼴 이름으로 따로 배포하지 않으며, PDF 문서 안에 넣어 쓰는 용도로만 둔다.
