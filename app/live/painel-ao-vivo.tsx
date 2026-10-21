"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";

import type { DadosDoPainel } from "@/lib/live/tipos";

import { horaEMinutoEmBrasilia, inteiro, moeda, rotuloDaHora } from "./_components/formato";
import { NumeroRolante } from "./_components/numero-rolante";
import { montarPontos } from "./_components/pontos";
import { Relogio } from "./_components/relogio";
import { usePainelAoVivo, type Conexao } from "./_components/use-painel-ao-vivo";
import {
  useControlesDaTela,
  useHoraEmBrasilia,
  useMovimentoReduzido,
  useTelaSempreAcesa,
  useUnidadeDaTela,
} from "./_components/use-tela";

// O gráfico depende do tamanho da janela: só existe no navegador.
const GraficoPorHora = dynamic(() => import("./_components/grafico-por-hora"), { ssr: false });

type EstadoVisivel = "ao_vivo" | "conectando" | "reconectando";

const TEXTO_DO_ESTADO: Record<EstadoVisivel, string> = {
  ao_vivo: "Ao vivo",
  conectando: "Conectando",
  reconectando: "Reconectando",
};

/** Alterna entre duas animações iguais: cada subida acende de novo. */
const classeDoPulso = (contador: number) => (contador === 0 ? "" : contador % 2 ? " lv-pulso-a" : " lv-pulso-b");

function estadoVisivel(conexao: Conexao, bancoOk: boolean): EstadoVisivel {
  if (conexao === "ao_vivo" && !bancoOk) return "reconectando";
  return conexao;
}

function detalheDoEstado(conexao: Conexao, bancoOk: boolean): string {
  if (!bancoOk) return "O banco de dados não respondeu. Tentando de novo…";
  if (conexao === "reconectando") return "Sem conexão com o servidor. Tentando de novo…";
  if (conexao === "conectando") return "Conectando ao servidor…";
  return "Atualização automática";
}

function Indicador({
  valor,
  texto,
  rotulo,
  pulso,
}: {
  valor: number | null;
  texto: string;
  rotulo: string;
  pulso: number;
}) {
  return (
    <li className="lv-kpi">
      <p className={`lv-kpi__valor${classeDoPulso(pulso)}`}>
        <NumeroRolante texto={texto} />
        <span className="lv-sr">{valor === null ? "sem dados" : texto}</span>
      </p>
      <p className="lv-kpi__rotulo">{rotulo}</p>
    </li>
  );
}

export default function PainelAoVivo({ inicial }: { inicial: DadosDoPainel | null }) {
  const { dados, conexao, bancoOk, desvio, pulsos, acrescimo, anuncio } = usePainelAoVivo(inicial);
  const horaAtual = useHoraEmBrasilia(desvio, inicial?.horaAtual ?? null);
  const unidade = useUnidadeDaTela();
  const movimentoReduzido = useMovimentoReduzido();
  const controles = useControlesDaTela();
  useTelaSempreAcesa();

  const estado = estadoVisivel(conexao, bancoOk);
  const receita = dados ? moeda(dados.receitaLiquidaCentavos) : "R$ —";
  const pontos = dados ? montarPontos(dados.porHora, horaAtual) : [];
  const semRemocoes = dados !== null && dados.atrasos === 0 && dados.reclamacoes === 0;

  let ultimoAtendimento = "";
  if (dados) {
    ultimoAtendimento = dados.ultimoAtendimentoEm
      ? `Último atendimento às ${horaEMinutoEmBrasilia(dados.ultimoAtendimentoEm)}`
      : "Nenhum atendimento hoje ainda";
  }

  return (
    <main className={`lv-tela${controles.visiveis ? "" : " lv-sem-cursor"}`}>
      <h1 className="lv-sr">Painel ao vivo de atendimentos realizados</h1>

      <header className="lv-topo">
        <Image
          src="/assets/logolinhafqnvj.png"
          alt="Fique no Verde Já"
          width={519}
          height={201}
          priority
          className="lv-logo"
          style={{ width: "auto" }}
        />
        <p className={`lv-status lv-status--${estado}`} role="status">
          <span className="lv-status__ponto" aria-hidden="true" />
          {TEXTO_DO_ESTADO[estado]}
        </p>
        <Relogio desvio={desvio} inicial={inicial?.geradoEm ?? null} />
      </header>

      <section className="lv-receita" aria-labelledby="lv-receita-titulo">
        <h2 id="lv-receita-titulo" className="lv-rotulo">
          Receita líquida do dia
        </h2>
        <p className={`lv-receita__valor${classeDoPulso(pulsos.receita)}`}>
          <NumeroRolante texto={receita} />
          <span className="lv-sr">{dados ? receita : "carregando"}</span>
        </p>
        <p className="lv-receita__sub">
          Acumulado até o momento{" "}
          {acrescimo && (
            <span key={acrescimo.sequencia} className="lv-acrescimo">
              + {moeda(acrescimo.centavos)}
            </span>
          )}
        </p>
      </section>

      <ul className="lv-kpis" aria-label="Números de hoje">
        <Indicador
          valor={dados?.atendimentos ?? null}
          texto={dados ? inteiro(dados.atendimentos) : "—"}
          rotulo="Atendimentos realizados"
          pulso={pulsos.atendimentos}
        />
        <Indicador
          valor={dados?.atrasos ?? null}
          texto={dados ? inteiro(dados.atrasos) : "—"}
          rotulo="Remoções de atraso"
          pulso={pulsos.atrasos}
        />
        <Indicador
          valor={dados?.reclamacoes ?? null}
          texto={dados ? inteiro(dados.reclamacoes) : "—"}
          rotulo="Remoções de reclamação"
          pulso={pulsos.reclamacoes}
        />
      </ul>

      <section className="lv-grafico" aria-labelledby="lv-grafico-titulo">
        <div className="lv-grafico__topo">
          <h2 id="lv-grafico-titulo" className="lv-grafico__titulo">
            Remoções por hora
          </h2>
          <ul className="lv-legenda" aria-hidden="true">
            <li className="lv-legenda__item" style={{ ["--lv-cor" as string]: "var(--lv-verde)" }}>
              Atrasos
            </li>
            <li className="lv-legenda__item" style={{ ["--lv-cor" as string]: "var(--lv-ciano)" }}>
              Reclamações
            </li>
          </ul>
        </div>

        <div className="lv-grafico__area">
          {dados && unidade !== null && (
            <GraficoPorHora pontos={pontos} horaAtual={horaAtual} unidade={unidade} animar={!movimentoReduzido} />
          )}
          {(!dados || semRemocoes) && (
            <p className="lv-grafico__aviso">
              {dados ? "Nenhuma remoção registrada hoje até agora" : "Carregando os números de hoje…"}
            </p>
          )}

          {dados && (
            <table className="lv-sr">
              <caption>Remoções por hora, hoje</caption>
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Atrasos</th>
                  <th scope="col">Reclamações</th>
                </tr>
              </thead>
              <tbody>
                {pontos
                  .filter((ponto) => !ponto.futura)
                  .map((ponto) => (
                    <tr key={ponto.hora}>
                      <th scope="row">
                        {rotuloDaHora(ponto.hora)}
                        {ponto.atual ? " (em andamento)" : ""}
                      </th>
                      <td>{ponto.atrasos ?? 0}</td>
                      <td>{ponto.reclamacoes ?? 0}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <footer className="lv-rodape">
        <span>{ultimoAtendimento}</span>
        <span
          className={`lv-rodape__estado${
            estado === "reconectando" ? " lv-rodape__estado--alerta" : estado === "conectando" ? " lv-rodape__estado--neutro" : ""
          }`}
        >
          {detalheDoEstado(conexao, bancoOk)}
        </span>
      </footer>

      <nav
        className={`lv-controles${controles.visiveis ? " lv-controles--visiveis" : ""}`}
        aria-label="Controles da tela"
      >
        <button type="button" className="lv-botao" onClick={controles.alternarTelaCheia}>
          {controles.telaCheia ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
          {controles.telaCheia ? "Sair da tela cheia" : "Tela cheia"}
        </button>
        <Link href="/dashboard/admin" className="lv-botao">
          <ArrowLeft size={16} aria-hidden="true" />
          Voltar ao sistema
        </Link>
      </nav>

      <p className="lv-sr" aria-live="polite">
        {anuncio}
      </p>
    </main>
  );
}
