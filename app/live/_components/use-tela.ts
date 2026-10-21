"use client";

import { useEffect, useState } from "react";

import { horaCheiaEmBrasilia } from "./formato";

/**
 * Hora cheia de Brasília (0 a 23), pelo relógio do servidor. Só muda na virada
 * da hora, para o gráfico não redesenhar a cada segundo.
 */
export function useHoraEmBrasilia(desvio: number, inicial: number | null): number | null {
  const [hora, setHora] = useState<number | null>(inicial);

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout>;
    const conferir = () => {
      const agora = Date.now() + desvio;
      setHora(horaCheiaEmBrasilia(agora));
      // Brasília não tem fração de hora no fuso: a virada é a mesma do UTC.
      const ateAVirada = 3_600_000 - (agora % 3_600_000) + 50;
      temporizador = setTimeout(conferir, Math.min(ateAVirada, 30_000));
    };
    temporizador = setTimeout(conferir, 0);
    return () => clearTimeout(temporizador);
  }, [desvio]);

  return hora;
}

/**
 * --lv-u em pixels (1% da largura de um quadro 16:9 que cabe na janela). O
 * gráfico usa para dimensionar letras e pontos como o resto da tela.
 */
export function useUnidadeDaTela(): number | null {
  const [unidade, setUnidade] = useState<number | null>(null);

  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const largura = window.innerWidth;
        const altura = window.innerHeight;
        // Mesma regra do CSS: em pé (celular) vale 1,15% da largura.
        setUnidade(largura <= altura ? largura * 0.0115 : Math.min(largura / 100, (altura * 1.7778) / 100));
      });
    };
    medir();
    window.addEventListener("resize", medir);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("resize", medir);
    };
  }, []);

  return unidade;
}

/** Quem pediu menos movimento no sistema não vê animação. */
export function useMovimentoReduzido(): boolean {
  const [reduzido, setReduzido] = useState(false);

  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    const atualizar = () => setReduzido(consulta.matches);
    const quadro = requestAnimationFrame(atualizar);
    consulta.addEventListener("change", atualizar);
    return () => {
      cancelAnimationFrame(quadro);
      consulta.removeEventListener("change", atualizar);
    };
  }, []);

  return reduzido;
}

/**
 * Tela de TV: o cursor e os botões somem depois de 3 s sem mexer o mouse; a
 * tecla F alterna a tela cheia.
 */
export function useControlesDaTela() {
  const [visiveis, setVisiveis] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);

  useEffect(() => {
    let esconder: ReturnType<typeof setTimeout> | null = null;

    const mostrar = () => {
      setVisiveis(true);
      if (esconder) clearTimeout(esconder);
      esconder = setTimeout(() => setVisiveis(false), 3_000);
    };

    const aoMudarTelaCheia = () => setTelaCheia(Boolean(document.fullscreenElement));

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== "f" && evento.key !== "F") return;
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      alternarTelaCheia();
    };

    window.addEventListener("mousemove", mostrar);
    window.addEventListener("pointerdown", mostrar);
    window.addEventListener("keydown", aoTeclar);
    document.addEventListener("fullscreenchange", aoMudarTelaCheia);

    return () => {
      if (esconder) clearTimeout(esconder);
      window.removeEventListener("mousemove", mostrar);
      window.removeEventListener("pointerdown", mostrar);
      window.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("fullscreenchange", aoMudarTelaCheia);
    };
  }, []);

  return { visiveis, telaCheia, alternarTelaCheia };
}

function alternarTelaCheia() {
  if (document.fullscreenElement) {
    void document.exitFullscreen?.().catch(() => undefined);
  } else {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }
}

/** Pede ao navegador para não apagar a tela (TV ligada o dia todo). */
export function useTelaSempreAcesa() {
  useEffect(() => {
    let ativo = true;
    let trava: WakeLockSentinel | null = null;

    const pedir = async () => {
      if (!ativo || document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      try {
        trava = await navigator.wakeLock.request("screen");
      } catch {
        // Sem suporte ou sem permissão: a tela segue normal.
      }
    };

    // O navegador solta a trava quando a aba sai de cena; pede de novo na volta.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void pedir();
    };

    void pedir();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      ativo = false;
      document.removeEventListener("visibilitychange", aoVoltar);
      void trava?.release().catch(() => undefined);
    };
  }, []);
}
