import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui 표준 유틸 — 조건부 클래스를 합치고 Tailwind 충돌을 뒤가 이기게 정리한다. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
