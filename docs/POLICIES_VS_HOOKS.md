# Policies vs Hooks - Quando usar cada um?

## 📋 Resumo Rápido

- **Policies**: Controle de acesso e permissões (QUEM pode fazer O QUÊ)
- **Hooks**: Lógica de negócio e validações complexas (COMO fazer)

## 🛡️ Policies (authMiddleware)

### O que fazem:
- ✅ Controlar quem pode executar operações (read, create, update, delete)
- ✅ Filtrar campos visíveis/editáveis por role
- ✅ Validações simples baseadas em expressões
- ✅ Bloquear operações antes mesmo de chegarem ao banco

### Limitações:
- ❌ Não podem fazer queries no banco
- ❌ Não podem modificar dados
- ❌ Não podem executar lógica complexa
- ❌ Apenas avaliam expressões booleanas

### Exemplos de uso:
```javascript
// Admin não pode modificar super_admin
'admin-cant-modify-super': '!(self.role === "admin" && target && target.role === "super_admin")'

// Apenas super_admin pode criar super_admins
'role-creation-rules': '!body.role || body.role !== "super_admin" || self.role === "super_admin"'
```

## 🎣 Hooks

### O que fazem:
- ✅ Validações que requerem acesso ao banco
- ✅ Modificar/normalizar dados antes de salvar
- ✅ Executar ações após operações
- ✅ Lógica de negócio complexa

### Quando usar:
1. **Validações únicas** (email, CPF, etc)
2. **Normalização de dados** (lowercase, remover acentos)
3. **Ações automáticas** (logs, emails, notificações)
4. **Validações que dependem de outros registros**

### Exemplos de uso:
```javascript
// Verificar email único (precisa query)
const existing = await Model.findOne({ email });

// Normalizar nome para busca
data.normalizedName = data.name.toLowerCase();

// Verificar se é último super_admin
const count = await Model.countDocuments({ role: 'super_admin' });
```

## 🔄 Fluxo de Execução

1. **Request chega** → 
2. **JWT valida usuário** → 
3. **Policy verifica permissão** → 
4. **Policy filtra campos** → 
5. **Hook beforeOperation executa** → 
6. **Operação no banco** → 
7. **Hook afterOperation executa**

## ✅ Boas Práticas

### Use Policies para:
- Controle de acesso por role
- Bloquear operações não permitidas
- Filtrar campos sensíveis
- Regras simples de negócio

### Use Hooks para:
- Validações que precisam do banco
- Normalização/transformação de dados
- Logs e auditoria
- Envio de emails/notificações
- Cálculos complexos

## 🚨 Evite Duplicação

❌ **ERRADO** - Mesma validação em dois lugares:
```javascript
// Policy
'no-promote-to-super': 'body.role !== "super_admin" || self.role === "super_admin"'

// Hook (duplicado)
if (user.role === 'admin' && data.role === 'super_admin') {
  throw new Error('Admin não pode promover para super_admin');
}
```

✅ **CERTO** - Cada um faz sua parte:
```javascript
// Policy - controla acesso
'no-promote-to-super': 'body.role !== "super_admin" || self.role === "super_admin"'

// Hook - validação que precisa do banco
const count = await Model.countDocuments({ email: data.email });
if (count > 0) throw new Error('Email já existe');
```

## 📊 Tabela Comparativa

| Funcionalidade | Policy | Hook | Motivo |
|----------------|--------|------|---------|
| Admin não pode criar super_admin | ✅ | ❌ | Controle de acesso simples |
| Validar email único | ❌ | ✅ | Precisa query no banco |
| Filtrar campos por role | ✅ | ❌ | É controle de visibilidade |
| Normalizar nome | ❌ | ✅ | É transformação de dados |
| Bloquear auto-delete | ❌ | ✅ | Não está nas policies padrão |
| Enviar email após criar | ❌ | ✅ | É ação pós-operação |
| Admin não vê outros admins | ✅ | ❌ | É controle de leitura |
| Setar updatedBy automático | ❌ | ✅ | É modificação de dados |
