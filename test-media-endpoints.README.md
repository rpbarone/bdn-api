# Script de Teste - Endpoints de Mídia R2

## 🚀 Como executar

```bash
# Dar permissão de execução (já feito)
chmod +x test-media-endpoints.sh

# Executar o script
./test-media-endpoints.sh
```

## 📋 Pré-requisitos

1. **Servidor rodando** na porta 5000
2. **Usuários de teste** no banco de dados:
   - `influencer@test.com` (senha: Test@123) - role: influencer
   - `admin@test.com` (senha: Admin@123) - role: admin
   - `superadmin@test.com` (senha: SuperAdmin@123) - role: super_admin

## 🧪 O que o script testa

### 1️⃣ **Testes sem autenticação**
- ❌ Tentar acessar endpoints sem token JWT
- ✅ Verificar se retorna erro 401

### 2️⃣ **Testes para Influencer**
- ✅ Gerar URL de upload para foto de perfil
- ✅ Confirmar upload de foto
- ✅ Gerar URL de download para próprio arquivo
- ❌ Tentar upload genérico (deve falhar)
- ❌ Tentar listar arquivos (deve falhar)
- ❌ Tentar acessar arquivo de outro usuário (deve falhar)

### 3️⃣ **Testes para Admin**
- ✅ Upload genérico com path customizado
- ✅ Listar arquivos com filtros
- ✅ Iniciar upload multipart
- ✅ Gerar URLs para partes
- ✅ Completar upload multipart
- ✅ Deletar arquivos

### 4️⃣ **Testes de Validação**
- ❌ Upload com tipo de arquivo não permitido
- ❌ Requisições com parâmetros faltando

## 📝 Observações

- O script **não faz upload real** para o R2, apenas testa a geração de URLs e validações
- Para testar upload real, use as URLs retornadas com ferramentas como Postman ou frontend
- Os testes de "confirmar upload" falharão porque o arquivo não existe no R2 (comportamento esperado)

## 🔧 Criando usuários de teste

Se precisar criar os usuários admin manualmente:

```javascript
// No MongoDB Shell ou Compass
db.users.insertOne({
  id: "ADM1000",
  name: "Admin Test",
  email: "admin@test.com",
  password: "$2a$10$YourHashedPasswordHere", // Hash de "Admin@123"
  role: "admin",
  status: "ativo"
});

db.users.insertOne({
  id: "ADM1001", 
  name: "Super Admin Test",
  email: "superadmin@test.com",
  password: "$2a$10$YourHashedPasswordHere", // Hash de "SuperAdmin@123"
  role: "super_admin",
  status: "ativo"
});
```

## 🎨 Legenda de cores no output

- 🔵 **Azul**: Teste em execução
- ✅ **Verde**: Teste passou
- ❌ **Vermelho**: Teste falhou (ou comportamento esperado de bloqueio)
- ⚠️ **Amarelo**: Informação importante

## 🐛 Troubleshooting

Se algum teste falhar inesperadamente:

1. Verifique se o servidor está rodando: `curl http://localhost:5000/health`
2. Verifique se os usuários existem no banco
3. Verifique as configurações do R2 no `.env`
4. Verifique os logs do servidor para mais detalhes
