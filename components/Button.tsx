"use client";

import * as React from "react";
// O import do Slot é problemático no ambiente de preview.
// import { Slot } from "@radix-ui/react-slot";

// 'cva' e '@/lib/utils' não estão disponíveis no preview e causam o erro 'undefined'.
// Vamos recriar a lógica manualmente.
// import { cva, type VariantProps } from "class-variance-authority";
// import { cn } from "@/lib/utils";

// 1. Implementação local da função 'cn'
function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}

// 2. Recriação manual da lógica 'cva'
const baseClasses =
  "relative inline-flex items-center justify-center font-medium transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 focus:outline-none";

const variantClasses = {
  default:
    "bg-gradient-to-r from-black/40 via-white/5 to-black/40 backdrop-blur-md text-white border-2 border-white/25 hover:border-white/30 hover:from-black/50 hover:via-white/10 hover:to-black/50 shadow-[0_0_20px_rgba(255,255,255,0.05)] hover:shadow-[0_0_30px_rgba(255,255,255,0.08)]",
  primary:
    "bg-gradient-to-r from-black/40 via-white/5 to-black/40 backdrop-blur-md text-white border-2 border-white/25 hover:border-white/30 hover:from-black/50 hover:via-white/10 hover:to-black/50 shadow-[0_0_20px_rgba(255,255,255,0.05)] hover:shadow-[0_0_30px_rgba(255,255,255,0.08)]",
  secondary:
    "bg-white/10 backdrop-blur-md text-white border-2 border-white/20 hover:bg-white/20 hover:border-white/30",
  outline:
    "bg-transparent border-2 border-white/30 text-white hover:bg-white/10 hover:border-white/40",
  ghost: "hover:bg-white/10 text-white",
  link: "text-white underline-offset-4 hover:underline",
};

// Mantém o rounded-xl que você pediu
const sizeClasses = {
  default: "h-11 px-6 py-2 text-base rounded-xl",
  sm: "h-9 px-4 py-1.5 text-sm rounded-xl",
  md: "h-12 px-8 py-3 text-base rounded-xl",
  lg: "h-14 px-10 py-4 text-lg rounded-xl",
  xl: "h-16 px-12 py-5 text-xl rounded-xl",
  icon: "h-11 w-11 rounded-xl",
};

// Interface simplificada sem 'VariantProps'
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
  fullWidth?: boolean;
  // asChild foi removido pois o Slot não está disponível
}

// Função que substitui 'buttonVariants'
function getButtonClasses({
  variant = "primary",
  size = "md",
}: {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
}) {
  const variantClass = variantClasses[variant] || variantClasses.primary;
  const sizeClass = sizeClasses[size] || sizeClasses.md;
  return cn(baseClasses, variantClass, sizeClass);
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth = false,
      children,
      ...props
    },
    ref
  ) => {
    // 3. Lógica do 'Slot' removida. 'Comp' é sempre 'button'.
    const Comp = "button";

    return (
      <Comp
        ref={ref}
        className={cn(
          getButtonClasses({ variant, size }), // Usa a nova função manual
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);

Button.displayName = "Button";