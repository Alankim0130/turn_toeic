# 출석 QR 포스터 PDF 글꼴

`poster-black.ttf` · `poster-bold.ttf` · `poster-semibold.ttf` 는 **Pretendard 1.3.9** (Black · Bold · SemiBold)에서
출석 QR 포스터에 쓰는 글자만 남긴 파일이다 (`scripts/poster-fonts.mjs`). 포스터 PDF(`src/lib/attendance-poster-pdf.ts`)에
넣어 인쇄할 때만 쓴다 — 사이트 화면의 글꼴은 여전히 CDN 의 Pretendard 다.

포스터 문구(`src/lib/attendance-poster.ts`)를 바꾸면 다시 만든다. 빠진 글자는 `attendance-poster.test.ts` 가 잡는다.

## 라이선스

Pretendard — Copyright © 2021–2023 Kil Hyung-jin (https://github.com/orioncactus/pretendard), with Reserved Font Name "Pretendard".
Inter · Source Han Sans · M PLUS 1p 에서 파생된 부분은 각 저작권자의 것이다.

이 글꼴은 **SIL Open Font License 1.1** 로 배포된다 — https://openfontlicense.org/open-font-license-official-text/
글꼴 파일을 따로 팔 수 없고, 이 라이선스와 저작권 표시를 함께 두어야 한다. 이 폴더의 파일은 줄인(부분) 파일이라
글꼴 이름으로 따로 배포하지 않으며, PDF 문서 안에 넣어 쓰는 용도로만 둔다.
