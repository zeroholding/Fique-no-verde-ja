import { ReactNode } from "react";
import clsx from "clsx";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export default function Card({ children, className }: CardProps) {
  return (
    <div
      className={clsx(
        "group relative overflow-hidden rounded-2xl border border-white/15 bg-white/5 p-6 text-white backdrop-blur-2xl transition-all duration-300 hover:border-white/25 hover:bg-white/10",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-60 transition-opacity duration-500 group-hover:opacity-80">
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-white/5 to-transparent" />
        <div className="absolute -inset-10 rounded-[40%] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.4),transparent)] blur-3xl" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
