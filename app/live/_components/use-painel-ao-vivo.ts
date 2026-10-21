"use client";

import { useEffect, useRef, useState } from "react";

import type { DadosDoPainel, MotivoDeEncerramento } from "@/lib/live/tipos";

import { inteiro, moeda } from "./formato";

/**
 * Conexão da tela com o servidor.
 *
 * Caminho normal: fluxo em tempo real (/api/live/stream, Server-Sent Events).
 * O servidor manda os números na conexão e a cada mudança; o navegador
 * reconecta sozinho se a rede cair.
 *
 * Reserva: se o fluxo travar no caminho (proxy que segura a resposta) ou for
 * recusado duas vezes seguidas, a tela passa a perguntar /api/live a cada 3 s
 * e volta a tentar o fluxo a cada minuto. Em nenhum caso a página recarrega.
 *
 * Sessão vencida leva ao login (e de volta para /live); quem deixou de ser
 * administrador vai para o dashboard.
 */

export type Conexao = "conectando" | "ao_vivo" | "reconectando";

/** Contadores de "subiu": cada número acende quando o seu muda. */
export type Pulsos = {
  receita: number;
  atendimentos: number;
  atrasos: number;
  reclamacoes: number;
};

export type Acrescimo = { centavos: number; sequencia: number };

export type EstadoDoPainel = {
  dados: DadosDoPainel | null;
  conexao: Conexao;
  bancoOk: boolean;
  /** Quanto somar ao relógio da TV para ter o do servidor (ms). */
  desvio: number;
  pulsos: Pulsos;
  /** Quanto a receita subiu nos últimos segundos (some sozinho). */
  acrescimo: Acrescimo | null;
  /** Texto curto para leitor de tela quando os números mudam. */
  anuncio: string;
};

const FLUXO = "/api/live/stream";
const LEITURA = "/api/live";
const ENTRAR_DE_NOVO = `/api/auth/logout?redirect=${encodeURIComponent("/live")}`;
const SEM_PERMISSAO = "/dashboard";

/** O servidor manda sinal de vida a cada 15 s; sem nada em 35 s, travou. */
const VIGIA_MS = 35_000;
const RESERVA_MS = 3_000;
const VOLTAR_AO_FLUXO_MS = 60_000;
const FALHAS_ATE_A_RESERVA = 2;
const ACRESCIMO_VISIVEL_MS = 6_000;
const AMOSTRAS_DO_RELOGIO = 12;

const PULSOS_ZERADOS: Pulsos = { receita: 0, atendimentos: 0, atrasos: 0, reclamacoes: 0 };

/** Identidade dos números (sem o horário da leitura). */
const chaveDosNumeros = (dados: DadosDoPainel) =>
  JSON.stringify([
    dados.dia,
    dados.receitaLiquidaCentavos,
    dados.atendimentos,
    dados.atrasos,
    dados.reclamacoes,
    dados.porHora,
    dados.ultimoAtendimentoEm,
  ]);

function lerEvento<T>(evento: Event): T | null {
  try {
    return JSON.parse((evento as MessageEvent<string>).data) as T;
  } catch {
    return null;
  }
}

export function usePainelAoVivo(inicial: DadosDoPainel | null): EstadoDoPainel {
  const [dados, setDados] = useState<DadosDoPainel | null>(inicial);
  const [conexao, setConexao] = useState<Conexao>("conectando");
  const [bancoOk, setBancoOk] = useState(true);
  const [desvio, setDesvio] = useState(0);
  const [pulsos, setPulsos] = useState<Pulsos>(PULSOS_ZERADOS);
  const [acrescimo, setAcrescimo] = useState<Acrescimo | null>(null);
  const [anuncio, setAnuncio] = useState("");

  /** Últimos números aplicados (só lido em eventos e temporizadores). */
  const ultimos = useRef<DadosDoPainel | null>(inicial);

  useEffect(() => {
    let ativo = true;
    let fonte: EventSource | null = null;
    let vigia: ReturnType<typeof setTimeout> | null = null;
    let reabrir: ReturnType<typeof setTimeout> | null = null;
    let reserva: ReturnType<typeof setInterval> | null = null;
    let voltarAoFluxo: ReturnType<typeof setTimeout> | null = null;
    let fimDoAcrescimo: ReturnType<typeof setTimeout> | null = null;
    let falhasDoFluxo = 0;
    let acrescimoAcumulado = 0;
    let sequencia = 0;

    /* ---------------- relógio do servidor ---------------- */

    // A latência só atrasa a amostra; a maior diferença recente é a mais fiel.
    const amostras: number[] = [];
    let desvioAtual = 0;
    const acertarRelogio = (horarioDoServidor: number) => {
      if (!Number.isFinite(horarioDoServidor)) return;
      amostras.push(horarioDoServidor - Date.now());
      if (amostras.length > AMOSTRAS_DO_RELOGIO) amostras.shift();
      const melhor = Math.max(...amostras);
      if (Math.abs(melhor - desvioAtual) >= 250) {
        desvioAtual = melhor;
        setDesvio(melhor);
      }
    };

    /* ---------------- números ---------------- */

    const aplicar = (novos: DadosDoPainel) => {
      acertarRelogio(novos.geradoEm);
      const anteriores = ultimos.current;
      if (anteriores && chaveDosNumeros(anteriores) === chaveDosNumeros(novos)) return;

      ultimos.current = novos;
      setDados(novos);

      // Primeiro dado ou virada do dia: só mostra, sem festa.
      if (!anteriores || anteriores.dia !== novos.dia) return;

      const subiu = {
        receita: novos.receitaLiquidaCentavos > anteriores.receitaLiquidaCentavos,
        atendimentos: novos.atendimentos > anteriores.atendimentos,
        atrasos: novos.atrasos > anteriores.atrasos,
        reclamacoes: novos.reclamacoes > anteriores.reclamacoes,
      };
      if (subiu.receita || subiu.atendimentos || subiu.atrasos || subiu.reclamacoes) {
        setPulsos((atual) => ({
          receita: atual.receita + Number(subiu.receita),
          atendimentos: atual.atendimentos + Number(subiu.atendimentos),
          atrasos: atual.atrasos + Number(subiu.atrasos),
          reclamacoes: atual.reclamacoes + Number(subiu.reclamacoes),
        }));
      }

      if (subiu.receita) {
        acrescimoAcumulado += novos.receitaLiquidaCentavos - anteriores.receitaLiquidaCentavos;
        sequencia += 1;
        setAcrescimo({ centavos: acrescimoAcumulado, sequencia });
        if (fimDoAcrescimo) clearTimeout(fimDoAcrescimo);
        fimDoAcrescimo = setTimeout(() => {
          acrescimoAcumulado = 0;
          setAcrescimo(null);
        }, ACRESCIMO_VISIVEL_MS);
      }

      if (
        novos.atendimentos !== anteriores.atendimentos ||
        novos.receitaLiquidaCentavos !== anteriores.receitaLiquidaCentavos
      ) {
        setAnuncio(
          `Atualizado: ${inteiro(novos.atendimentos)} atendimentos hoje, receita líquida de ${moeda(novos.receitaLiquidaCentavos)}.`,
        );
      }
    };

    /* ---------------- saída ---------------- */

    const desligarTudo = () => {
      fecharFonte();
      if (reabrir) clearTimeout(reabrir);
      if (reserva) clearInterval(reserva);
      if (voltarAoFluxo) clearTimeout(voltarAoFluxo);
      if (fimDoAcrescimo) clearTimeout(fimDoAcrescimo);
      reabrir = null;
      reserva = null;
      voltarAoFluxo = null;
      fimDoAcrescimo = null;
    };

    const sair = (destino: string) => {
      ativo = false;
      desligarTudo();
      window.location.replace(destino);
    };

    /* ---------------- leitura avulsa (/api/live) ---------------- */

    const lerAgora = async (): Promise<boolean> => {
      try {
        const resposta = await fetch(LEITURA, { cache: "no-store", headers: { Accept: "application/json" } });
        if (resposta.status === 401) {
          sair(ENTRAR_DE_NOVO);
          return false;
        }
        if (resposta.status === 403) {
          sair(SEM_PERMISSAO);
          return false;
        }
        if (!resposta.ok) {
          if (ativo && resposta.status === 503) setBancoOk(false);
          return false;
        }
        const corpo = (await resposta.json()) as { painel?: DadosDoPainel };
        if (!ativo || !corpo.painel) return false;
        setBancoOk(true);
        aplicar(corpo.painel);
        return true;
      } catch {
        return false;
      }
    };

    /* ---------------- reserva: pergunta a cada 3 s ---------------- */

    const pararReserva = () => {
      if (reserva) clearInterval(reserva);
      if (voltarAoFluxo) clearTimeout(voltarAoFluxo);
      reserva = null;
      voltarAoFluxo = null;
    };

    const iniciarReserva = () => {
      if (!ativo) return;
      if (!reserva) {
        reserva = setInterval(() => {
          void lerAgora().then((ok) => {
            if (ativo && reserva) setConexao(ok ? "ao_vivo" : "reconectando");
          });
        }, RESERVA_MS);
      }
      if (voltarAoFluxo) clearTimeout(voltarAoFluxo);
      voltarAoFluxo = setTimeout(() => {
        voltarAoFluxo = null;
        falhasDoFluxo = 0;
        abrirFonte();
      }, VOLTAR_AO_FLUXO_MS);
    };

    /* ---------------- fluxo em tempo real ---------------- */

    function fecharFonte() {
      if (vigia) clearTimeout(vigia);
      vigia = null;
      if (fonte) fonte.close();
      fonte = null;
    }

    const armarVigia = () => {
      if (vigia) clearTimeout(vigia);
      vigia = setTimeout(() => {
        vigia = null;
        void fluxoFalhou();
      }, VIGIA_MS);
    };

    /** O fluxo caiu de vez ou travou: descobre o motivo e decide o próximo passo. */
    const fluxoFalhou = async () => {
      fecharFonte();
      if (!ativo) return;
      falhasDoFluxo += 1;
      const ok = await lerAgora();
      if (!ativo) return;
      setConexao(ok ? "ao_vivo" : "reconectando");
      if (falhasDoFluxo >= FALHAS_ATE_A_RESERVA) {
        iniciarReserva();
        return;
      }
      if (reabrir) clearTimeout(reabrir);
      reabrir = setTimeout(abrirFonte, ok ? 1_000 : 3_000);
    };

    function abrirFonte() {
      if (!ativo) return;
      fecharFonte();
      if (reabrir) clearTimeout(reabrir);
      reabrir = null;

      if (typeof EventSource === "undefined") {
        iniciarReserva();
        return;
      }

      const esta = new EventSource(FLUXO);
      fonte = esta;
      armarVigia();

      esta.addEventListener("painel", (evento) => {
        const novos = lerEvento<DadosDoPainel>(evento);
        if (!ativo || fonte !== esta || !novos) return;
        falhasDoFluxo = 0;
        pararReserva();
        armarVigia();
        setBancoOk(true);
        setConexao("ao_vivo");
        aplicar(novos);
      });

      esta.addEventListener("ping", (evento) => {
        if (!ativo || fonte !== esta) return;
        armarVigia();
        const ping = lerEvento<{ agora: number }>(evento);
        if (ping) acertarRelogio(ping.agora);
      });

      esta.addEventListener("estado", (evento) => {
        if (!ativo || fonte !== esta) return;
        const estado = lerEvento<{ banco: "ok" | "falhou" }>(evento);
        if (estado) setBancoOk(estado.banco === "ok");
      });

      esta.addEventListener("sessao", (evento) => {
        const sessao = lerEvento<{ motivo: MotivoDeEncerramento }>(evento);
        sair(sessao?.motivo === "sem_permissao" ? SEM_PERMISSAO : ENTRAR_DE_NOVO);
      });

      esta.onerror = () => {
        if (!ativo || fonte !== esta) return;
        setConexao("reconectando");
        // CONNECTING: o navegador já está tentando de novo sozinho.
        // CLOSED: o servidor recusou (401, 403, 503) ou a resposta não era um fluxo.
        if (esta.readyState === EventSource.CLOSED) void fluxoFalhou();
      };
    }

    abrirFonte();

    return () => {
      ativo = false;
      desligarTudo();
    };
  }, []);

  return { dados, conexao, bancoOk, desvio, pulsos, acrescimo, anuncio };
}
