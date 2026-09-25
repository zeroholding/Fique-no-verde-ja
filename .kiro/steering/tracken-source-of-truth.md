# TRACKen — fonte obrigatória de contexto

Em toda solicitação relacionada a TRACKen, FNVJ × TRACKen, `/tracken`, `/api/tracken`, tickets, status, motivos de negativa, webhooks, credenciais, outbox ou transportadoras:

1. Leia primeiro `APINOVA/TRACKEN_SOURCE_OF_TRUTH.md`.
2. Confira o código executável e, quando a dúvida envolver uma chamada real, confira também o registro real em `tracken_outbox`/`tracken_request_log`; não responda por memória, screenshot isolado ou documento histórico.
3. Trate `APINOVA/TRACKEN_SOURCE_OF_TRUTH.md` como contrato canônico. `APINOVA/PAINEL_FNVJ_TRACKEN.md` e `APINOVA/INTEGRACAO_FNVJ_TRACKEN.md` são históricos e não vencem a fonte canônica.
4. Toda alteração de endpoint, campo, status, transição, motivo, header, assinatura, retry, credencial, tabela ou procedimento operacional deve atualizar a fonte canônica na mesma mudança.
5. A documentação pública `app/tracken/docapi/page.tsx`, o banco (`tracken_status_map`) e o payload produzido por `lib/tracken/tickets.ts` devem permanecer coerentes.
6. Nunca registre tokens, secrets, senhas ou URLs de banco nesse documento. Use placeholders.
7. Decisão pendente deve ficar marcada como PENDENTE; não trate hipótese como contrato confirmado.

#[[file:APINOVA/TRACKEN_SOURCE_OF_TRUTH.md]]
