import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/* shadcn/ui Button — 색은 globals.css의 브랜드 매핑을 읽는다 (08/27 도입).
   크기가 화면마다 갈리던 것을 여기 한 곳으로 모은다: 같은 무게의 행위는 같은 size. */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all disabled:pointer-events-none disabled:opacity-45 outline-none focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:",
        navy: "bg-navy text-on-navy hover:opacity-90",
        destructive:
          "border border-destructive/45 bg-transparent text-destructive hover:bg-destructive/[.06]",
        outline:
          "border border-border bg-card-bg/70 text-foreground hover:bg-card-bg hover:border-line-2",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        /** 표 행 **안**에 들어가는 것 — 행 높이를 밀지 않아야 한다 (08/28 신설).
         *  기존 BTN_ROW* 상수(px-2.5 py-1 · 0.6875rem)가 이 자리였고,
         *  shadcn 최소 단인 sm(h-8=32px)은 표 행에 넣으면 행이 밀린다. */
        xs: "h-7 rounded-md px-2.5 text-[0.6875rem]",
        /** 상단 바·카드 헤더의 보조 행위 */
        sm: "h-8 rounded-md px-3 text-[0.75rem]",
        /** 카드 안의 일반 행위 */
        default: "h-10 px-4 text-[0.875rem]",
        /** 화면의 결정 행위 (판정·승인) — 가장 큰 한 단 */
        lg: "h-12 rounded-lg px-6 text-[0.875rem]",
        icon: "size-9 rounded-md",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

function Button({
  className, variant, size, asChild = false, ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}

export { Button, buttonVariants };
