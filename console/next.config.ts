import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 자체 gzip 압축을 끈다 (2026-08-17).
  // 켜두면 Railway 엣지 프록시와 겹쳐 chunked 응답의 종료 청크(0\r\n\r\n)가 유실되고,
  // 엄격한 클라이언트(Chrome)가 net::ERR_INVALID_CHUNKED_ENCODING으로 페이지를 통째로 거부한다
  // (사파리·curl은 관대해서 정상으로 보여 발견이 늦었다). 압축은 Railway 엣지가 담당한다.
  // 근거: node_modules/next/dist/docs/.../next-config-js/compress.md — "프록시가 압축을 처리하면 false로"
  compress: false,

  // 개발 모드 표시기(N 배지) 자리 — 기본값 bottom-left 가 사이드바 「접기」 버튼을
  // 정확히 덮는다 (08/30 팀장: "좌측 최하단에 저거 N 모양 뭐야?"). 끄지는 않는다 —
  // 컴파일·런타임 오류를 그 배지가 알려 주기 때문이다. 배포본에는 애초에 뜨지 않는다.
  // 근거: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/devIndicators.md
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
