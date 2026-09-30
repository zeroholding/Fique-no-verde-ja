---
inclusion: auto
name: ads-source-of-truth
description: Regras obrigatórias ao estudar, implementar ou corrigir o módulo /ads, relatórios Meta/Facebook Ads, importações, métricas, campanhas, conjuntos e anúncios no Fique no Verde.
---

# FNVJ Ads — fonte obrigatória de contexto

Em toda solicitação relacionada a `/ads`, Meta Ads, Facebook Ads, tráfego pago, campanhas, conjuntos, anúncios, criativos, investimento, CTR, CPC, CPM, CPA, CPL, ROAS ou importação de relatório publicitário:

1. Leia primeiro `app/ads/README.md`.
2. Trate esse arquivo como contrato vivo do módulo.
3. Atualize o README na mesma alteração que mudar rota, tela, coluna, alias, fórmula, banco, permissão, importação, limite ou procedimento.
4. Diferencie sempre **implementado**, **planejado** e **pendente**.
5. Não trate cabeçalho hipotético do Meta como contrato sem conferir um relatório real.
6. Não invente métrica ausente nem calcule ROAS sem valor de conversão compatível.
7. Nunca registre relatório real, ID de conta, token, cookie, segredo ou senha na documentação.

#[[file:app/ads/README.md]]
