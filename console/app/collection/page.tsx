/**
 * 「수집 현장」 — 08/30 오후에 **「KOL 탐색」 탭으로 흡수**됐다 (팀장 지시:
 * "미국 지도있는 탭도 kol탐색이라는 서브탭으로 가야할거 같고").
 *
 * 두 화면이 같은 질문의 앞뒤였다: 이 화면이 «어디서 듣고 있나», KOL 탐색이
 * «어디를 아직 못 들었나». 나뉘어 있으면 지도를 보고 격자로 넘어가는 동선이
 * 메뉴를 거쳐야 했다. 지금은 `/analytics?tab=kol` 한 화면에 위아래로 놓인다.
 *
 * **라우트는 지우지 않고 리다이렉트로 남긴다** — 08/30 오전 PR·아티팩트·문서에
 * 이 주소가 이미 적혀 있고, 죽은 링크를 남기면 «없어진 화면»으로 읽힌다.
 * 본문 컴포넌트(`_view.tsx`·`_tilemap.tsx`)는 그대로 살아 KOL 탭이 재사용한다.
 */

import { redirect } from "next/navigation";

export default function CollectionPage() {
  redirect("/analytics?tab=kol");
}
