"use client";

import { useEffect, useState } from "react";

import { dataEmBrasilia, horarioEmBrasilia } from "./formato";

/**
 * Data e hora de Brasília pelo relógio do servidor (o da TV pode estar errado).
 * Começa no horário em que o servidor montou a página, para o HTML do servidor
 * e o da tela serem o mesmo, e depois anda sozinho, na virada de cada segundo.
 * O horário usa os algarismos tabulares da fonte, para não tremer a cada
 * segundo.
 */
export function Relogio({ desvio, inicial }: { desvio: number; inicial: number | null }) {
  const [agora, setAgora] = useState<number | null>(inicial);

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout>;
    const tique = () => {
      const instante = Date.now() + desvio;
      setAgora(instante);
      temporizador = setTimeout(tique, 1_000 - (instante % 1_000) + 15);
    };
    temporizador = setTimeout(tique, 0);
    return () => clearTimeout(temporizador);
  }, [desvio]);

  const data = agora === null ? "--/--/----" : dataEmBrasilia(agora);
  const horario = agora === null ? "--:--:--" : horarioEmBrasilia(agora);

  return (
    <div className="lv-relogio">
      <p className="lv-relogio__linha">
        <span>{data}</span> <span className="lv-relogio__hora">{horario}</span>
      </p>
      <p className="lv-relogio__fuso">Horário de Brasília</p>
    </div>
  );
}
