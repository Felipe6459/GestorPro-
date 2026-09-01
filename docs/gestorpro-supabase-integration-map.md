# GestorPro — mapa de integração com o Supabase existente

## Objetivo

Este documento registra a primeira conciliação entre o código do `GestorPro-` e o banco Supabase existente. Nesta etapa não são executadas migrations destrutivas e nenhuma tabela existente é removida.

## Decisões confirmadas

- Supabase Auth continua sendo a fonte de identidade/sessão.
- `PLATFORM_ADMIN_EMAILS` é a fronteira de autorização do MASTER da plataforma.
- O MASTER não deve ser modelado como um `OWNER` comum de tenant.
- `organizations` é a base de tenant existente no banco.
- `organization_members` é a associação atual entre usuário e tenant.
- `clients` é a tabela de clientes existente que deve ser preservada.
- `gp_clients` não será removida até que todos os usos e dados sejam auditados.
- `payments` é a tabela financeira existente dos clientes dos tenants.
- `subscriptions` representa a assinatura do tenant com o GestorPro e deve permanecer separada do financeiro dos clientes.
- `asaas_*` é infraestrutura existente de integração por organização e deve permanecer isolada por `organization_id`.
- `gestorpro_audit_log` é a base existente para auditoria do produto.

## Principais incompatibilidades encontradas

### Client

O Prisma do `GestorPro-` define `Client` com `userId` obrigatório e `organizationId` opcional. O banco existente usa `organization_id` obrigatório e não possui o conjunto de colunas do modelo Prisma original.

**Decisão:** não executar `prisma migrate` sobre o banco existente ainda. O modelo Prisma precisa ser adaptado/introspectado para o schema real.

### Organization / Membership

O Prisma usa `Organization`, `Membership` e `User`. O banco existente usa `organizations`, `organization_members` e `profiles`.

**Decisão:** tratar o banco existente como fonte de verdade para a integração e criar uma camada de mapeamento/adaptação no código, em vez de duplicar tenants.

### Plans

O banco existente possui `plans` como catálogo de planos do GestorPro, sem `organization_id`.

**Decisão:** não reutilizar `plans` para os planos comerciais dos clientes dos tenants sem uma separação explícita. Billing do GestorPro e planos dos clientes são domínios diferentes.

### Payments

O banco existente possui `payments` com `organization_id`, `client_id`, dados de status, Asaas e Pix.

**Decisão:** preservar e adaptar o módulo financeiro do GestorPro para usar essa estrutura.

### Asaas

O banco possui `asaas_customers`, `asaas_settings` e `asaas_webhook_events`, todos com `organization_id`.

**Decisão:** preservar a integração existente. Credenciais sensíveis nunca devem chegar ao cliente/browser.

## MASTER

O e-mail operacional definido para o MASTER é:

`felipemedeiros6459@gmail.com`

Ele foi colocado apenas no `.env.example` como valor de referência. A configuração real de produção deve ser feita na variável de ambiente `PLATFORM_ADMIN_EMAILS` do ambiente de deploy. Nenhuma senha é armazenada no código.

## Próxima etapa técnica obrigatória

1. Introspectar o schema real do Supabase.
2. Comparar com `prisma/schema.prisma` modelo por modelo.
3. Adaptar os modelos Prisma ao banco existente ou decidir explicitamente quais módulos continuarão usando Prisma.
4. Auditar RLS das tabelas de tenant e das tabelas sensíveis do Asaas.
5. Só depois criar migrations novas para lacunas comprovadas.
6. Testar isolamento entre dois tenants e acesso MASTER.

## Regra de segurança

Não executar `prisma migrate reset`, `prisma db push` ou qualquer operação equivalente contra o Supabase existente antes da conclusão dessa conciliação.
