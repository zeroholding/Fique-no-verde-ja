"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// --- Definições de Interface ---

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClassName?: string;
}

interface GlassEffectProps {
  children: React.ReactNode;
  className?: string;
}

// --- Componente de Filtro SVG ---
// (Define o efeito de distorção de vidro)
// **** ATUALIZADO COM O NOSSO EFEITO ****
const GlassFilter = () => (
  <svg style={{ display: "none" }}>
    <filter
      id="glass-distortion"
      x="0%"
      y="0%"
      width="100%"
      height="100%"
      filterUnits="objectBoundingBox"
    >
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.001 0.005"
        numOctaves="1"
        seed="17"
        result="turbulence"
      />
      <feComponentTransfer in="turbulence" result="mapped">
        <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
        <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
        <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
      </feComponentTransfer>
      <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
      <feSpecularLighting
        in="softMap"
        surfaceScale="5"
        specularConstant="1"
        specularExponent="100"
        lightingColor="white"
        result="specLight"
      >
        <fePointLight x="-200" y="-200" z="300" />
      </feSpecularLighting>
      <feComposite
        in="specLight"
        operator="arithmetic"
        k1="0"
        k2="1"
        k3="1"
        k4="0"
        result="litImage"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="softMap"
        scale="150" // <-- ATUALIZADO de 200 para 150
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  </svg>
);

// --- Componente de Efeito de Vidro ---
// (Aplica o filtro e o estilo de vidro)
// **** ATUALIZADO COM O NOSSO EFEITO ****
const GlassEffect = ({ children, className = "" }: GlassEffectProps) => {
  const glassStyle = {
    // Mantido o boxShadow do seu modal, pois é mais apropriado
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)", 
    // background: "rgba(13, 13, 17, 0.65)", // <-- REMOVIDO para um vidro claro
    transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 2.2)",
  };

  // Substituindo clsx por template literals
  const combinedClassName = `relative flex font-normal overflow-hidden text-white transition-all duration-700 ${className}`;

  return (
    <div className={combinedClassName} style={glassStyle}>
      <div
        className="absolute inset-0 z-0 overflow-hidden rounded-inherit rounded-3xl"
        style={{
          backdropFilter: "blur(16px)", // <-- ATUALIZADO de 12px para 16px
          filter: "url(#glass-distortion)",
          isolation: "isolate",
        }}
      />
      <div
        className="absolute inset-0 z-10 rounded-inherit"
        style={{
          // ATUALIZADO do linear-gradient para o nosso "branco"
          background: "rgba(255, 255, 255, 0.10)", 
        }}
      />
      <div
        className="absolute inset-0 z-20 rounded-inherit rounded-3xl overflow-hidden"
        style={{
          // REMOVIDO o 'boxShadow inset' (a borda)
        }}
      />
      <div className="relative z-30 w-full">{children}</div>
    </div>
  );
};

// --- Componente Modal ---
// (O código que você forneceu)

export const Modal = ({
  open,
  title,
  onClose,
  children,
  footer,
  widthClassName = "max-w-lg",
}: ModalProps) => {
  const [isVisible, setIsVisible] = useState(open);
  const [animationState, setAnimationState] = useState<"open" | "close">(
    open ? "open" : "close"
  );

  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;

    if (open) {
      setIsVisible(true);
      requestAnimationFrame(() => setAnimationState("open"));
    } else {
      setAnimationState("close");
      timeout = setTimeout(() => setIsVisible(false), 250);
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!isVisible) {
    return null;
  }

  // Substituindo clsx por template literals
  const widthClass = `w-full ${widthClassName}`;
  const overlayState =
    animationState === "open" ? "opacity-100" : "opacity-0 pointer-events-none";
  const modalMotion =
    animationState === "open"
      ? "opacity-100 translate-y-0 scale-100"
      : "opacity-0 -translate-y-3 scale-95";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Overlay */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${overlayState}`}
        onClick={onClose}
      />

      {/* Conteúdo do Modal */}
      <div className={widthClass}>
        <GlassFilter />
        <GlassEffect
          className={`rounded-3xl p-0 cursor-default transition-all duration-300 ${modalMotion}`}
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-6 py-4">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-200 hover:text-white transition-colors text-2xl leading-none"
              aria-label="Fechar modal"
            >
              &times;
            </button>
          </div>

          {/* Corpo */}
          <div className="px-6 py-5 text-white max-h-[70vh] overflow-y-auto scrollbar-hide">
            {children}
          </div>

          {/* Rodapé */}
          {footer && (
            <div className="px-6 py-4 rounded-b-3xl border-t border-white/20">
              {footer}
            </div>
          )}
        </GlassEffect>
      </div>
    </div>,
    document.body
  );
};

// --- Componente App (Exemplo de uso) ---
// (Componente principal para demonstrar o modal)

export default function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="flex items-center justify-center w-full min-h-screen font-sans bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      <button
        onClick={() => setIsModalOpen(true)}
        className="px-6 py-3 text-lg font-semibold text-white bg-white/30 rounded-xl shadow-lg backdrop-blur-md hover:bg-white/40 transition-all duration-300"
      >
        Abrir Modal
      </button>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Modal com Efeito de Vidro"
        footer={
          <div className="flex justify-end">
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-5 py-2 font-semibold text-white bg-white/20 rounded-lg shadow-md hover:bg-white/30 transition-all duration-300"
            >
              Fechar
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p>
            Este é o conteúdo dentro do modal. Você pode colocar qualquer
            elemento React aqui.
          </p>
          <p>
            O efeito de "vidro fosco" (glassmorphism) é aplicado usando filtros
            SVG e backdrop-filter do CSS.
          </p>
          <p>Pressione 'Esc' ou clique fora para fechar.</p>
        </div>
      </Modal>
    </div>
  );
}