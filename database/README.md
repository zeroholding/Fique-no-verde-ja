# 📊 Scripts SQL - Sistema de Vendas

Scripts para criação da estrutura de banco de dados do sistema de vendas.

## 📁 Arquivos

### 1. `sales-schema.sql`
Script principal com toda estrutura do banco de dados:
- Tabelas de produtos
- Faixas de preço
- Vendas e itens
- Políticas de comissão
- Comissões geradas
- Views úteis
- Triggers automáticos

### 2. `sales-queries-examples.sql`
Queries de exemplo e consultas úteis:
- Inserir produtos e preços
- Criar vendas
- Confirmar/cancelar vendas
- Gerar comissões
- Relatórios diversos

## 🚀 Como Executar no pgAdmin

### Passo 1: Abrir pgAdmin
1. Abra o **pgAdmin 4**
2. Conecte-se ao seu servidor PostgreSQL
3. Selecione o banco de dados do projeto

### Passo 2: Executar Schema Principal
1. Clique com botão direito no banco de dados
2. Selecione **"Query Tool"** (ou pressione `Alt+Shift+Q`)
3. Abra o arquivo `sales-schema.sql`:
   - Clique no ícone 📂 (Open File)
   - Navegue até `C:\Users\Gustavo Maldanis\Desktop\fqnj\database\`
   - Selecione `sales-schema.sql`
4. Clique em **▶️ Execute** (ou pressione `F5`)
5. Aguarde a mensagem de sucesso

### Passo 3: Testar com Queries de Exemplo (Opcional)
1. Abra uma nova Query Tool
2. Abra o arquivo `sales-queries-examples.sql`
3. Execute queries individuais conforme necessário
4. **Importante:** Substitua todos os `'SEU-UUID-AQUI'` pelos IDs reais

## 📋 Tabelas Criadas

### 1. **products**
Cadastro de produtos disponíveis para venda
- `id`, `name`, `description`, `sku`, `is_active`

### 2. **price_ranges**
Faixas de preço por quantidade
- `product_id`, `min_quantity`, `max_quantity`, `unit_price`
- Suporta vigência temporal

### 3. **sales**
Registro de vendas
- `client_id`, `attendant_id`, `sale_date`
- `status`: `aberta` | `confirmada` | `cancelada`
- `payment_method`: dinheiro, pix, cartão, boleto
- Desconto geral (% ou R$)

### 4. **sale_items**
Itens de cada venda
- `sale_id`, `product_id`, `quantity`, `unit_price`
- Desconto por item (% ou R$)
- Preços congelados

### 5. **commission_policies**
Políticas de comissão
- Por produto e/ou vendedor
- Tipo: percentual ou fixo
- Base: líquida ou bruta

### 6. **commissions**
Comissões geradas
- Vinculadas a vendas confirmadas
- Status: `a_pagar` | `pago` | `cancelado`
- Data de referência e pagamento

## 🔍 Views Criadas

### `v_sales_details`
Vendas com informações completas (cliente, vendedor, valores)

### `v_commissions_pending`
Comissões pendentes de pagamento

## ⚙️ Triggers Automáticos

Todos os `updated_at` são atualizados automaticamente em qualquer UPDATE.

## 📊 Exemplos de Uso

### Buscar preço por quantidade
```sql
SELECT unit_price
FROM price_ranges
WHERE product_id = 'uuid-do-produto'
  AND is_active = true
  AND min_quantity <= 25
  AND (max_quantity IS NULL OR max_quantity >= 25)
LIMIT 1;
```

### Criar venda
```sql
INSERT INTO sales (client_id, attendant_id, payment_method, status)
VALUES ('client-uuid', 'user-uuid', 'pix', 'aberta')
RETURNING id;
```

### Adicionar item
```sql
INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal, total)
VALUES ('sale-uuid', 'product-uuid', 'Produto A', 10, 50.00, 500.00, 500.00);
```

### Confirmar venda
```sql
UPDATE sales
SET status = 'confirmada', confirmed_at = CURRENT_TIMESTAMP
WHERE id = 'sale-uuid' AND status = 'aberta';
```

## 🛠️ Manutenção

### Backup
```bash
pg_dump -U postgres -d seu_banco > backup_vendas.sql
```

### Restaurar
```bash
psql -U postgres -d seu_banco < backup_vendas.sql
```

## ⚠️ Notas Importantes

1. **UUIDs**: Todos os IDs usam UUID v4
2. **Constraints**: Validações automáticas em todos os valores monetários
3. **Cascata**: Itens são deletados automaticamente ao deletar venda
4. **Transações**: Use BEGIN/COMMIT para operações críticas
5. **Permissões**: Ajuste os GRANTs conforme seu usuário PostgreSQL

## 🔗 Relacionamentos

```
users (atendente) ──┐
                    ├──> sales ──> sale_items ──> products
clients ────────────┘                 │
                                      ├──> price_ranges
                                      │
                                      └──> commissions ──> commission_policies
```

## 📞 Suporte

Se encontrar algum erro durante a execução:

1. Verifique se as tabelas `users` e `clients` já existem
2. Ajuste as referências de FOREIGN KEY se necessário
3. Consulte o log de erros no pgAdmin
4. Verifique as permissões do usuário do banco

## ✅ Checklist de Instalação

- [ ] Executar `sales-schema.sql`
- [ ] Verificar se todas as tabelas foram criadas
- [ ] Verificar se as views estão funcionando
- [ ] Testar com queries de exemplo
- [ ] Inserir produtos de teste
- [ ] Inserir faixas de preço
- [ ] Criar venda de teste
- [ ] Confirmar venda de teste
- [ ] Verificar comissões geradas

---

**Versão:** 1.0.0
**Data:** Janeiro 2025
**Banco:** PostgreSQL 13+
