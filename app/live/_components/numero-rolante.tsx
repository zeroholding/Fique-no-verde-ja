"use client";

import { useEffect, useRef, useState } from "react";

const ALGARISMOS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Largura de cada algarismo (em "em") na fonte do próprio número. O "1" da
 * Outfit é bem mais estreito que o "0"; com largura fixa o número ficava com
 * buracos ("1 1 4"). Medido no navegador, depois que a fonte carrega.
 */
function useLargurasDosAlgarismos() {
  const raiz = useRef<HTMLSpanElement>(null);
  const [larguras, setLarguras] = useState<number[] | null>(null);
  const [animar, setAnimar] = useState(false);

  useEffect(() => {
    const elemento = raiz.current;
    if (!elemento) return;
    let ativo = true;
    let quadro = 0;
    let liberarAnimacao = 0;

    const medir = () => {
      if (!ativo || !elemento.isConnected) return;
      const tamanho = parseFloat(getComputedStyle(elemento).fontSize);
      if (!tamanho) return;
      const regua = document.createElement("span");
      regua.setAttribute("aria-hidden", "true");
      regua.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;";
      elemento.appendChild(regua);
      // Dez repetições diluem o arredondamento. offsetWidth ignora transform,
      // então a medida não sai errada se o número estiver no meio do "acender".
      const medidas = ALGARISMOS.map((algarismo) => {
        regua.textContent = algarismo.repeat(10);
        return Math.round((regua.offsetWidth / 10 / tamanho) * 1000) / 1000;
      });
      regua.remove();
      setLarguras((anteriores) =>
        anteriores && anteriores.every((valor, indice) => valor === medidas[indice]) ? anteriores : medidas,
      );
      // A primeira medida entra sem animação; daí em diante a largura acompanha o rolinho.
      cancelAnimationFrame(liberarAnimacao);
      liberarAnimacao = requestAnimationFrame(() => {
        if (ativo) setAnimar(true);
      });
    };

    const medirNoProximoQuadro = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(medir);
    };

    medirNoProximoQuadro();
    void document.fonts?.ready.then(medirNoProximoQuadro);
    document.fonts?.addEventListener?.("loadingdone", medirNoProximoQuadro);

    return () => {
      ativo = false;
      cancelAnimationFrame(quadro);
      cancelAnimationFrame(liberarAnimacao);
      document.fonts?.removeEventListener?.("loadingdone", medirNoProximoQuadro);
    };
  }, []);

  return { raiz, larguras, animar };
}

/**
 * Número em rolinho de placar: cada algarismo é uma coluna que rola até o
 * valor novo, e a coluna toma a largura do algarismo que mostra.
 *
 * As posições são contadas da direita: quando o número ganha uma casa, as
 * unidades continuam no mesmo lugar e só a casa nova aparece.
 *
 * É só visual (aria-hidden). Quem usa coloca o valor por extenso ao lado,
 * para leitor de tela.
 */
export function NumeroRolante({ texto }: { texto: string }) {
  const { raiz, larguras, animar } = useLargurasDosAlgarismos();
  const caracteres = Array.from(texto);

  return (
    <span ref={raiz} className={`lv-odo${animar ? " lv-odo--animar" : ""}`} aria-hidden="true">
      {caracteres.map((caractere, indice) => {
        const daDireita = caracteres.length - indice;

        if (caractere >= "0" && caractere <= "9") {
          const algarismo = Number(caractere);
          return (
            <span
              key={`a${daDireita}`}
              className="lv-odo__coluna"
              style={larguras ? { width: `${larguras[algarismo]}em` } : undefined}
            >
              <span className="lv-odo__faixa" style={{ transform: `translateY(-${algarismo * 10}%)` }}>
                {ALGARISMOS.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </span>
            </span>
          );
        }

        return (
          <span key={`s${daDireita}`} className="lv-odo__sinal">
            {caractere}
          </span>
        );
      })}
    </span>
  );
}
