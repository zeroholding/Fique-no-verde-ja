# Guia de Instalação do Banco de Dados no pgAdmin

## Passo a Passo Completo

### 1. Abrir o pgAdmin
- Abra o pgAdmin 4
- Conecte-se ao seu servidor PostgreSQL

### 2. Criar o Banco de Dados

**Opção A: Usando SQL**
1. Clique com botão direito em "Databases"
2. Selecione "Query Tool"
3. Cole e execute este comando:
```sql
CREATE DATABASE fqnj_db;
```

**Opção B: Usando Interface Gráfica**
1. Clique com botão direito em "Databases"
2. Selecione "Create" > "Database..."
3. No campo "Database", digite: `fqnj_db`
4. Clique em "Save"

### 3. Conectar ao Novo Banco de Dados

1. No painel esquerdo, expanda "Databases"
2. Encontre "fqnj_db"
3. Clique com botão direito em "fqnj_db"
4. Selecione "Query Tool"

### 4. Executar o Script Completo

1. Com a Query Tool aberta (conectada ao fqnj_db)
2. Abra o arquivo: `SETUP_COMPLETO_PGADMIN.sql`
3. **IMPORTANTE:** Delete ou comente a primeira linha `CREATE DATABASE fqnj_db;` (pois já criamos)
4. Copie todo o resto do conteúdo
5. Cole na Query Tool
6. Clique em "Execute/Run" (ícone de play ▶️) ou pressione F5

### 5. Verificar se Tudo Foi Criado

Execute esta query para verificar:

```sql
-- Verificar tabelas criadas
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Resultado esperado:
-- clients
-- client_origins
-- sessions
-- users

-- Verificar origens cadastradas
SELECT * FROM client_origins ORDER BY name;

-- Resultado esperado: 12 origens
```

### 6. Estrutura Final do Banco

Após a execução, você terá:

#### Tabelas:
- ✅ `users` - Usuários do sistema
- ✅ `sessions` - Sessões de login
- ✅ `client_origins` - Origens dos clientes
- ✅ `clients` - Cadastro de clientes

#### Dados Iniciais:
- ✅ 12 origens pré-cadastradas:
  - Instagram
  - Facebook
  - Indicação
  - Google
  - WhatsApp
  - Site
  - LinkedIn
  - TikTok
  - Youtube
  - Outdoor
  - Panfleto
  - Evento

## Solução de Problemas

### Erro: "database already exists"
- O banco já foi criado antes
- Conecte-se ao fqnj_db e execute apenas o resto do script

### Erro: "extension already exists"
- Normal, ignore este erro
- Significa que a extensão uuid-ossp já estava instalada

### Erro: "relation already exists"
- As tabelas já existem
- Você pode:
  - **Opção 1**: Usar o banco como está
  - **Opção 2**: Deletar o banco e recomeçar:
    ```sql
    DROP DATABASE fqnj_db;
    CREATE DATABASE fqnj_db;
    -- Depois execute o script completo novamente
    ```

### Erro de permissão
- Certifique-se de estar conectado com um usuário com permissões de superuser
- Geralmente o usuário `postgres` tem todas as permissões

## Próximos Passos

Após executar o SQL com sucesso:

1. **Iniciar a aplicação:**
   ```bash
   npm run dev
   ```

2. **Criar seu primeiro usuário admin:**
   - Acesse: http://localhost:3000
   - Crie uma conta
   - No pgAdmin, transforme este usuário em admin:
   ```sql
   UPDATE users SET is_admin = true WHERE email = 'seu-email@exemplo.com';
   ```

3. **Acessar o painel:**
   - Faça login na aplicação
   - Clique em "Área Administrativa"
   - Você verá os menus: Visão Geral, Usuários, Clientes, Origens

## Script Alternativo (Apenas Clientes)

Se você já tem o banco `fqnj_db` configurado com usuários e só quer adicionar as tabelas de clientes:

```sql
-- APENAS TABELAS DE CLIENTES E ORIGENS
-- Execute este script se já tiver users e sessions configurados

-- Tabela de origens
CREATE TABLE IF NOT EXISTS client_origins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de clientes
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    birth_date DATE,
    email VARCHAR(255),
    cpf_cnpj VARCHAR(18),
    origin_id UUID REFERENCES client_origins(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_client_origins_name ON client_origins(name);
CREATE INDEX IF NOT EXISTS idx_client_origins_is_active ON client_origins(is_active);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_cpf_cnpj ON clients(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_clients_origin_id ON clients(origin_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_by_user_id ON clients(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);
CREATE INDEX IF NOT EXISTS idx_clients_is_active ON clients(is_active);

-- Trigger (use a função update_updated_at_column que já existe)
CREATE TRIGGER update_client_origins_updated_at
    BEFORE UPDATE ON client_origins
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Dados iniciais
INSERT INTO client_origins (name, description) VALUES
    ('Instagram', 'Cliente veio através do Instagram'),
    ('Facebook', 'Cliente veio através do Facebook'),
    ('Indicação', 'Cliente foi indicado por outro cliente'),
    ('Google', 'Cliente encontrou através de busca no Google'),
    ('WhatsApp', 'Cliente entrou em contato via WhatsApp'),
    ('Site', 'Cliente entrou em contato pelo site')
ON CONFLICT (name) DO NOTHING;

SELECT 'Tabelas de clientes criadas com sucesso!' as status;
```

## Dúvidas?

- Todos os scripts estão em: `database/`
- Documentação completa em: `CLIENTES_README.md`
- Em caso de erro, verifique os logs do pgAdmin
