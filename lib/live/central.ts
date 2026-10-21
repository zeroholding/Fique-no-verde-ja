// lib/live/central.ts
//
// Central do painel ao vivo: UMA leitura do banco a cada 2 segundos serve
// todas as telas abertas em /live, e só vai para as telas quando algum número
// muda. Sem tela aberta, nada é lido.
//
// Por que leitura periódica e não aviso do banco (LISTEN/NOTIFY): aviso
// exigiria gatilho nas tabelas de venda (migração) ou mexer em toda rota que
// grava venda, estorno, cancelamento, importação e troca de data. A leitura
// pega tudo isso de uma vez, inclusive o que mudar direto no banco, e custa
// uma consulta pequena e indexada (só as vendas de hoje) a cada 2 segundos.
//
// A instância fica em globalThis: rota e página podem carregar este módulo em
// pacotes diferentes, e duas centrais dobrariam as leituras.

import { pool } from "@/lib/db";

import { SQL_DO_PAINEL, chaveDoPainel, montarPainel, type LinhaDoPainel } from "./consulta";
import type { DadosDoPainel, EventoDoPainel, MotivoDeEncerramento } from "./tipos";

/** Intervalo entre leituras enquanto houver tela aberta. */
const LEITURA_MS = 2_000;
/** Sinal de vida para a tela (e para proxy não derrubar a conexão parada). */
const PING_MS = 15_000;
/** Confere de novo se quem está assistindo continua administrador e ativo. */
const REVALIDACAO_MS = 60_000;
/** Leitura que passa disso é tratada como falha (sem abrir outra por cima). */
const LEITURA_TRAVADA_MS = 10_000;
/** Pedido avulso (página, API) aceita a última leitura se for desta idade. */
const CACHE_MS = 1_500;
/** Com o banco fora do ar, repete o erro no log no máximo uma vez por minuto. */
const LOG_DE_FALHA_MS = 60_000;
/** Maior espera aceita por setTimeout (cerca de 24,8 dias). */
const MAIOR_ESPERA = 2_147_483_647;

export type Assinante = {
  usuarioId: string;
  /** Fim da sessão (epoch ms). Na hora, a tela é avisada e o fluxo fecha. */
  expiraEm: number | null;
  /** Escreve um evento no fluxo. Se lançar erro, a tela é dada como fechada. */
  enviar: (evento: EventoDoPainel, dados: unknown) => void;
  fechar: () => void;
};

type Registro = Assinante & {
  recebeuPainel: boolean;
  expiracao: ReturnType<typeof setTimeout> | null;
};

type Leitura = { dados: DadosDoPainel; chave: string; lidoEm: number };

function comLimite<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    const limite = setTimeout(() => rejeitar(new Error(`Leitura do painel passou de ${ms} ms.`)), ms);
    promessa.then(
      (valor) => {
        clearTimeout(limite);
        resolver(valor);
      },
      (erro: unknown) => {
        clearTimeout(limite);
        rejeitar(erro);
      },
    );
  });
}

class CentralDoPainel {
  private readonly registros = new Map<number, Registro>();
  private proximoId = 1;
  private ultimo: Leitura | null = null;
  private leitura: Promise<DadosDoPainel> | null = null;
  private leituraDesde = 0;
  private bancoOk = true;
  private ultimoLogDeFalha = 0;
  private cicloDeLeitura: ReturnType<typeof setInterval> | null = null;
  private cicloDePing: ReturnType<typeof setInterval> | null = null;
  private cicloDeRevalidacao: ReturnType<typeof setInterval> | null = null;

  /** Telas conectadas agora. */
  get conectadas(): number {
    return this.registros.size;
  }

  /**
   * Registra uma tela. Ela recebe um sinal de vida na hora e os números assim
   * que houver leitura recente. Devolve a função que a desliga.
   */
  assinar(assinante: Assinante): () => void {
    const id = this.proximoId++;
    const registro: Registro = { ...assinante, recebeuPainel: false, expiracao: null };
    this.registros.set(id, registro);

    if (assinante.expiraEm !== null) {
      const espera = Math.min(Math.max(0, assinante.expiraEm - Date.now()), MAIOR_ESPERA);
      registro.expiracao = setTimeout(() => this.encerrar(id, "expirada"), espera);
      registro.expiracao.unref?.();
    }

    this.enviar(id, "ping", { agora: Date.now() });
    if (!this.bancoOk) this.enviar(id, "estado", { banco: "falhou" });

    if (this.ultimo && Date.now() - this.ultimo.lidoEm <= CACHE_MS) {
      registro.recebeuPainel = true;
      this.enviar(id, "painel", this.ultimo.dados);
    } else {
      void this.ler().catch(() => undefined);
    }

    // A tela pode ter caído já no primeiro envio.
    if (this.registros.has(id)) this.ligarCiclos();
    return () => this.remover(id);
  }

  /** Números atuais para quem pede uma vez (página e /api/live). */
  obter(): Promise<DadosDoPainel> {
    if (this.ultimo && Date.now() - this.ultimo.lidoEm <= CACHE_MS) {
      return Promise.resolve(this.ultimo.dados);
    }
    return comLimite(this.ler(), LEITURA_TRAVADA_MS);
  }

  /* ----------------------------- leitura ----------------------------- */

  /** Uma leitura por vez: quem chega durante uma leitura recebe a mesma. */
  private ler(): Promise<DadosDoPainel> {
    if (this.leitura) return this.leitura;

    this.leituraDesde = Date.now();
    const leitura = pool
      .query<LinhaDoPainel>(SQL_DO_PAINEL)
      .then(
        (resultado) => {
          const dados = montarPainel(resultado.rows, Date.now());
          this.aoLer(dados);
          return dados;
        },
        (erro: unknown) => {
          this.aoFalhar(erro);
          throw erro;
        },
      )
      .finally(() => {
        if (this.leitura === leitura) this.leitura = null;
      });

    this.leitura = leitura;
    return leitura;
  }

  private aoLer(dados: DadosDoPainel) {
    const voltou = !this.bancoOk;
    this.bancoOk = true;

    const chave = chaveDoPainel(dados);
    const mudou = this.ultimo?.chave !== chave;
    this.ultimo = { dados, chave, lidoEm: Date.now() };

    if (voltou) {
      console.info("[LIVE] O banco voltou a responder.");
      this.paraTodas("estado", { banco: "ok" });
    }

    for (const [id, registro] of this.registros) {
      if (mudou || !registro.recebeuPainel) {
        registro.recebeuPainel = true;
        this.enviar(id, "painel", dados);
      }
    }
  }

  private aoFalhar(erro: unknown) {
    const agora = Date.now();
    if (this.bancoOk || agora - this.ultimoLogDeFalha >= LOG_DE_FALHA_MS) {
      console.error("[LIVE] Falha ao ler os números do painel ao vivo:", erro);
      this.ultimoLogDeFalha = agora;
    }
    if (this.bancoOk) {
      this.bancoOk = false;
      this.paraTodas("estado", { banco: "falhou" });
    }
  }

  /* ------------------------------ ciclos ------------------------------ */

  private readonly aCadaLeitura = () => {
    if (this.registros.size === 0) {
      this.desligarCiclosSemTelas();
      return;
    }
    if (this.leitura) {
      // Leitura ainda pendurada: não abre outra por cima (o pool é de 10
      // conexões, divididas com o sistema todo). Só avisa as telas.
      if (this.bancoOk && Date.now() - this.leituraDesde > LEITURA_TRAVADA_MS) {
        this.aoFalhar(new Error(`Leitura do painel pendente há mais de ${LEITURA_TRAVADA_MS} ms.`));
      }
      return;
    }
    void this.ler().catch(() => undefined);
  };

  private readonly aCadaPing = () => {
    this.paraTodas("ping", { agora: Date.now() });
  };

  private readonly aCadaRevalidacao = () => {
    void this.revalidar();
  };

  private ligarCiclos() {
    if (this.cicloDeLeitura) return;
    this.cicloDeLeitura = setInterval(this.aCadaLeitura, LEITURA_MS);
    this.cicloDePing = setInterval(this.aCadaPing, PING_MS);
    this.cicloDeRevalidacao = setInterval(this.aCadaRevalidacao, REVALIDACAO_MS);
    // Não seguram o processo de pé no desligamento do servidor.
    this.cicloDeLeitura.unref?.();
    this.cicloDePing.unref?.();
    this.cicloDeRevalidacao.unref?.();
  }

  private desligarCiclosSemTelas() {
    if (this.registros.size > 0) return;
    if (this.cicloDeLeitura) clearInterval(this.cicloDeLeitura);
    if (this.cicloDePing) clearInterval(this.cicloDePing);
    if (this.cicloDeRevalidacao) clearInterval(this.cicloDeRevalidacao);
    this.cicloDeLeitura = null;
    this.cicloDePing = null;
    this.cicloDeRevalidacao = null;
  }

  /** Quem deixou de ser administrador (ou foi desativado) sai na hora. */
  private async revalidar() {
    const usuarios = [...new Set([...this.registros.values()].map((registro) => registro.usuarioId))];
    if (!usuarios.length) return;

    let permitidos: Set<string>;
    try {
      const resultado = await pool.query<{ id: string }>(
        `SELECT id::text AS id
           FROM users
          WHERE id::text = ANY($1::text[])
            AND is_admin IS TRUE
            AND is_active IS NOT FALSE`,
        [usuarios],
      );
      permitidos = new Set(resultado.rows.map((linha) => linha.id));
    } catch {
      // Banco fora: mantém quem está assistindo. A leitura já avisa a tela.
      return;
    }

    for (const [id, registro] of this.registros) {
      if (!permitidos.has(registro.usuarioId)) this.encerrar(id, "sem_permissao");
    }
  }

  /* ------------------------------- telas ------------------------------ */

  private enviar(id: number, evento: EventoDoPainel, dados: unknown) {
    const registro = this.registros.get(id);
    if (!registro) return;
    try {
      registro.enviar(evento, dados);
    } catch {
      this.remover(id);
    }
  }

  private paraTodas(evento: EventoDoPainel, dados: unknown) {
    for (const id of [...this.registros.keys()]) this.enviar(id, evento, dados);
  }

  private encerrar(id: number, motivo: MotivoDeEncerramento) {
    const registro = this.registros.get(id);
    if (!registro) return;
    this.enviar(id, "sessao", { motivo });
    try {
      registro.fechar();
    } catch {
      // já fechada
    }
    this.remover(id);
  }

  private remover(id: number) {
    const registro = this.registros.get(id);
    if (!registro) return;
    if (registro.expiracao) clearTimeout(registro.expiracao);
    this.registros.delete(id);
    this.desligarCiclosSemTelas();
  }
}

const escopoGlobal = globalThis as typeof globalThis & {
  __fnvjCentralDoPainelAoVivo?: CentralDoPainel;
};

/** A central do processo (criada na primeira chamada). */
export function centralDoPainel(): CentralDoPainel {
  if (!escopoGlobal.__fnvjCentralDoPainelAoVivo) {
    escopoGlobal.__fnvjCentralDoPainelAoVivo = new CentralDoPainel();
  }
  return escopoGlobal.__fnvjCentralDoPainelAoVivo;
}
