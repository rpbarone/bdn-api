# Gerenciamento de Administradores - Implementação

## 📋 Resumo das Mudanças Implementadas

### 1. **Policy de User Ajustada** (`/policies/User.js`)
- **Antes:** `read: 'isSelf || admin+'`
- **Depois:** `read: 'isSelf || (admin && target && target.role === "influencer") || super_admin'`
- **Resultado:** Admin só pode ver influencers, não outros admins

### 2. **Novo Endpoint de Estatísticas** (`GET /api/users/stats/admins`)
- **Acesso:** Exclusivo para super_admin
- **Retorna:**
  - Total de admins (admin + super_admin)
  - Quantidade de admins ativos
  - Quantidade de admins inativos
  - Quantidade por role (admin/super_admin)
  - Percentuais de ativos/inativos

### 3. **Filtros de Data Adicionados** 
- **Novos parâmetros de query:**
  - `createdFrom`: Data de início (formato: YYYY-MM-DD)
  - `createdTo`: Data de fim (formato: YYYY-MM-DD)
- **Exemplo:** `/api/users?createdFrom=2024-01-01&createdTo=2024-12-31`

### 4. **Restrição de Listagem para Admin**
- Lógica adicionada no GET `/api/users`
- Se usuário é admin, força `query.role = 'influencer'`
- Admin nunca verá outros admins na listagem

### 5. **Hooks de Validação** (`/hooks/User.js`)
- **beforeCreate:**
  - Admin não pode criar super_admin
  - Validação de email único
  - Normalização de nome para busca
- **beforeUpdate:**
  - Admin não pode promover para super_admin
  - Admin não pode modificar super_admin
  - Validação de email único em updates
- **beforeDelete:**
  - Admin não pode deletar super_admin
  - Não pode deletar própria conta
  - Proteção contra deletar último super_admin

### 6. **Registro de Último Acesso**
- Middleware JWT atualizado para registrar `lastLogin`
- Update assíncrono para não bloquear requisição
- Campo `lastLogin` atualizado a cada autenticação

## 🔒 Regras de Segurança Implementadas

1. **Hierarquia de Roles:**
   - `super_admin` > `admin` > `influencer`
   - Admin não pode afetar super_admin de forma alguma

2. **Visibilidade:**
   - Super_admin: vê todos
   - Admin: vê apenas influencers e seu próprio perfil
   - Influencer: vê apenas seu próprio perfil

3. **Operações:**
   - Criar super_admin: apenas super_admin
   - Modificar super_admin: apenas super_admin
   - Deletar super_admin: apenas super_admin
   - Ver estatísticas de admins: apenas super_admin

## 📊 Endpoints Disponíveis

### Para Super Admin:
- `GET /api/users` - Lista todos usuários
- `GET /api/users/stats/admins` - Estatísticas de admins
- `GET /api/users/:id` - Detalhes de qualquer usuário
- `POST /api/users` - Criar qualquer tipo de usuário
- `PUT /api/users/:id` - Editar qualquer usuário
- `DELETE /api/users/:id` - Deletar qualquer usuário

### Para Admin:
- `GET /api/users` - Lista apenas influencers
- `GET /api/users/:id` - Detalhes de influencers ou próprio perfil
- `POST /api/users` - Criar influencers ou admins (não super_admin)
- `PUT /api/users/:id` - Editar influencers ou próprio perfil
- `DELETE /api/users/:id` - Deletar apenas influencers

## 🧪 Como Testar

1. **Script de teste incluído:** `test-admin-management.sh`
2. **Substitua os tokens no script com tokens válidos**
3. **Execute:** `./test-admin-management.sh`

## ✅ Checklist de Funcionalidades

- [x] Super admin criar admins
- [x] Super admin editar admins
- [x] Super admin obter todos admins
- [x] Super admin obter um único admin
- [x] Super admin deletar admins
- [x] Quantidade de usuários admin
- [x] Quantidade admins ativos
- [x] Quantidade admins inativos
- [x] Filtrar por nome, email, id
- [x] Filtrar por cargo (role)
- [x] Filtrar por status
- [x] Filtrar por período de criação
- [x] Ver último acesso
- [x] Ver status
- [x] Ver data de criação
- [x] Admin NÃO pode ver outros admins
