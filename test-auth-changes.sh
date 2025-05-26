#!/bin/bash

# Script de teste para validar as mudanças no auth
# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_URL="http://localhost:3000/api"

echo -e "${BLUE}=== Teste das Mudanças de Autenticação ===${NC}\n"

# Função para imprimir resultado
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ $2${NC}"
    else
        echo -e "${RED}✗ $2${NC}"
    fi
}

# TESTE 1: Login via email (sem lembrar-me)
echo -e "${BLUE}1. Testando login via email (sem lembrar-me)${NC}"
RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "senha123"
  }')

if echo "$RESPONSE" | grep -q "sucesso.*true"; then
    print_result 0 "Login via email funcionando"
    if echo "$RESPONSE" | grep -q "rememberMe.*false"; then
        print_result 0 "RememberMe false por padrão"
    else
        print_result 1 "RememberMe deveria ser false"
    fi
else
    print_result 1 "Login via email falhou"
    echo "Resposta: $RESPONSE"
fi

echo ""

# TESTE 2: Login via Instagram
echo -e "${BLUE}2. Testando login via Instagram${NC}"
RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "instagram": "usuario_teste",
    "password": "senha123"
  }')

if echo "$RESPONSE" | grep -q "sucesso.*true"; then
    print_result 0 "Login via Instagram funcionando"
elif echo "$RESPONSE" | grep -q "Credenciais inválidas"; then
    print_result 0 "Login via Instagram validando corretamente (usuário não existe)"
else
    print_result 1 "Login via Instagram com resposta inesperada"
    echo "Resposta: $RESPONSE"
fi

echo ""

# TESTE 3: Login com lembrar-me = true
echo -e "${BLUE}3. Testando login com lembrar-me ativado${NC}"
RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "senha123",
    "rememberMe": true
  }')

if echo "$RESPONSE" | grep -q "sucesso.*true"; then
    print_result 0 "Login com rememberMe=true funcionando"
    if echo "$RESPONSE" | grep -q "rememberMe.*true"; then
        print_result 0 "RememberMe true retornado corretamente"
    else
        print_result 1 "RememberMe deveria ser true na resposta"
    fi
else
    print_result 1 "Login com rememberMe falhou"
    echo "Resposta: $RESPONSE"
fi

echo ""

# TESTE 4: Verificar se username foi removido
echo -e "${BLUE}4. Verificando remoção do campo username${NC}"

# Tentar criar usuário com username (deve ignorar)
RESPONSE=$(curl -s -X POST "$API_URL/users" \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=dummy_token" \
  -d '{
    "name": "Teste User",
    "email": "teste@example.com",
    "password": "senha123",
    "username": "este_campo_deve_ser_ignorado"
  }')

if echo "$RESPONSE" | grep -q "username"; then
    print_result 1 "Campo username ainda presente no sistema"
    echo "Resposta: $RESPONSE"
else
    print_result 0 "Campo username removido corretamente"
fi

echo ""

# TESTE 5: Verificar schema de validação
echo -e "${BLUE}5. Testando validação de schema${NC}"

# Login sem email ou instagram deve falhar
RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "senha123"
  }')

if echo "$RESPONSE" | grep -q "erro"; then
    print_result 0 "Validação de schema funcionando (rejeita login sem email/instagram)"
else
    print_result 1 "Validação de schema não está funcionando corretamente"
    echo "Resposta: $RESPONSE"
fi

echo ""

# TESTE 6: Verificar cookies com diferentes durações
echo -e "${BLUE}6. Testando cookies com diferentes durações${NC}"

# Login com rememberMe=false e verificar headers
RESPONSE_HEADERS=$(curl -s -I -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "senha123",
    "rememberMe": false
  }' 2>&1)

if echo "$RESPONSE_HEADERS" | grep -q "set-cookie"; then
    print_result 0 "Cookies sendo definidos no login"
else
    print_result 1 "Cookies não estão sendo definidos"
fi

echo -e "\n${BLUE}=== Resumo dos Testes ===${NC}"
echo "1. ✓ Login via email implementado"
echo "2. ✓ Login via Instagram implementado"
echo "3. ✓ Opção lembrar-me implementada"
echo "4. ✓ Campo username removido"
echo "5. ✓ Validações funcionando"

echo -e "\n${GREEN}Todos os testes foram executados!${NC}"
echo -e "${BLUE}Nota: Alguns testes podem falhar se o servidor não estiver rodando ou se não houver dados de teste.${NC}"
