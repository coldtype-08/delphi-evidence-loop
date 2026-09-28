import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/* shadcn/ui Badge + 입장 신호등 변형 (08/27).
   지지·보류·반대는 처음 보는 사람도 한눈에 갈려야 하므로 **색으로** 가른다
   (DECISIONS 08/27 #196: "방향은 색으로 가르는 것이 맞다"의 보드판). */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium transition-colors [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-card-bg/60 text-muted-foreground",
        mark: "border-primary/45 bg-primary/[.14] text-orange-deep",
        support: "border-stance-support/45 bg-stance-support-soft text-stance-support",
        hold: "border-stance-hold/45 bg-stance-hold-soft text-stance-hold",
        oppose: "border-stance-oppose/45 bg-stance-oppose-soft text-stance-oppose",
      },
      size: {
        sm: "px-2 py-0.5 text-[0.6875rem] [&>svg]:size-2.5",
        default: "px-2.5 py-1 text-[0.75rem] [&>svg]:size-3",
        /** 신호등 — 멀리서도 읽혀야 하는 자리 */
        lg: "gap-2 px-3 py-1.5 text-[0.875rem] font-semibold [&>svg]:size-4",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

function Badge({
  className, variant, size, asChild = false, ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant, size, className }))} {...props} />
  );
}

export { Badge, badgeVariants };
