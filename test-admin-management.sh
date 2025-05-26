#!/bin/bash

# Script de teste para validar as mudanças no gerenciamento de admins
# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000/api"

echo -e "${YELLOW}=== Teste de Gerenciamento de Admins ===${NC}\n"

# Função para fazer requisições
test_endpoint() {
    local method=$1
    local endpoint=$2
    local token=$3
    local data=$4
    local description=$5
    
    echo -e "${YELLOW}Testando: $description${NC}"
    
    if [ -z "$data" ]; then
        response=$(curl -s -X $method \
            -H "Cookie: access_token=$token" \
            -H "Content-Type: application/json" \
            "$BASE_URL$endpoint")
    else
        response=$(curl -s -X $method \
            -H "Cookie: access_token=$token" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint")
    fi
    
    if echo "$response" | grep -q '"sucesso":true'; then
        echo -e "${GREEN}✓ Sucesso${NC}"
    else
        echo -e "${RED}✗ Falhou${NC}"
        echo "Resposta: $response"
    fi
    echo ""
}

# Testes com diferentes roles
echo -e "${YELLOW}1. Testando com SUPER_ADMIN:${NC}\n"

# Substitua com um token válido de super_admin
SUPER_ADMIN_TOKEN="seu_token_super_admin_aqui"

test_endpoint "GET" "/users/stats/admins" "$SUPER_ADMIN_TOKEN" "" \
    "Estatísticas de admins (deve funcionar)"

test_endpoint "GET" "/users?role=admin" "$SUPER_ADMIN_TOKEN" "" \
    "Listar todos admins (deve funcionar)"

test_endpoint "GET" "/users?role=super_admin" "$SUPER_ADMIN_TOKEN" "" \
    "Listar super_admins (deve funcionar)"

test_endpoint "GET" "/users?createdFrom=2024-01-01&createdTo=2024-12-31" "$SUPER_ADMIN_TOKEN" "" \
    "Filtrar por período de criação"

echo -e "\n${YELLOW}2. Testando com ADMIN:${NC}\n"

# Substitua com um token válido de admin
ADMIN_TOKEN="seu_token_admin_aqui"

test_endpoint "GET" "/users/stats/admins" "$ADMIN_TOKEN" "" \
    "Estatísticas de admins (deve falhar - 403)"

test_endpoint "GET" "/users" "$ADMIN_TOKEN" "" \
    "Listar usuários (deve retornar apenas influencers)"

test_endpoint "GET" "/users?role=admin" "$ADMIN_TOKEN" "" \
    "Tentar listar admins (deve retornar vazio ou apenas influencers)"

echo -e "\n${YELLOW}3. Testando validações de criação/atualização:${NC}\n"

# Teste de criação de super_admin por admin (deve falhar)
test_endpoint "POST" "/users" "$ADMIN_TOKEN" \
    '{"name":"Test Super","email":"super@test.com","password":"123456","role":"super_admin"}' \
    "Admin tentando criar super_admin (deve falhar)"

# Teste de promoção para super_admin por admin (deve falhar)
test_endpoint "PUT" "/users/ID_DE_UM_USER" "$ADMIN_TOKEN" \
    '{"role":"super_admin"}' \
    "Admin tentando promover para super_admin (deve falhar)"

echo -e "\n${GREEN}=== Testes concluídos ===${NC}"
echo -e "${YELLOW}Nota: Substitua os tokens e IDs com valores válidos do seu ambiente${NC}"
