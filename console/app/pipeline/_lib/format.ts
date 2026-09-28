/** 처리 라인 로그의 시각 표기. */

export const hhmmss = (iso: string) =>
  new Date(iso).toLocaleTimeString("ko-KR", { hour12: false });
