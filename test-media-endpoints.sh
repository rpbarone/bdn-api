#!/bin/bash

# Script de teste para endpoints de mídia R2
# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações
BASE_URL="http://localhost:5000"
API_URL="${BASE_URL}/api"

# Variáveis para armazenar tokens e dados
INFLUENCER_TOKEN=""
ADMIN_TOKEN=""
SUPER_ADMIN_TOKEN=""
UPLOAD_KEY=""
UPLOAD_ID=""

# Função para imprimir com cores
print_test() {
    echo -e "\n${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Função para fazer login e obter token
login() {
    local email=$1
    local password=$2
    local role=$3
    
    print_test "Fazendo login como $role ($email)"
    
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}" \
        "${API_URL}/auth/login" \
        -c cookies.txt)
    
    if echo "$response" | grep -q "sucesso.*true"; then
        # Extrair token do cookie
        token=$(grep "access_token" cookies.txt | awk '{print $7}')
        print_success "Login realizado com sucesso"
        echo "$token"
    else
        print_error "Falha no login: $response"
        echo ""
    fi
}

# Função para criar usuários de teste se não existirem
setup_test_users() {
    print_info "Configurando usuários de teste..."
    
    # Criar influencer
    curl -s -X POST \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Test Influencer",
            "email": "influencer@test.com",
            "password": "Test@123",
            "role": "influencer"
        }' \
        "${API_URL}/auth/register" > /dev/null 2>&1
    
    # Para criar admin e super_admin, você precisaria de um endpoint específico ou fazer via banco
    print_info "Certifique-se de ter os seguintes usuários no banco:"
    print_info "- influencer@test.com (role: influencer)"
    print_info "- admin@test.com (role: admin)"
    print_info "- superadmin@test.com (role: super_admin)"
}

# ============================================
# TESTES PARA INFLUENCER
# ============================================
test_influencer() {
    echo -e "\n${YELLOW}═══════════════════════════════════════════${NC}"
    echo -e "${YELLOW}       TESTES PARA INFLUENCER              ${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
    
    # Login como influencer
    INFLUENCER_TOKEN=$(login "influencer@test.com" "Test@123" "influencer")
    
    if [ -z "$INFLUENCER_TOKEN" ]; then
        print_error "Não foi possível obter token de influencer"
        return
    fi
    
    # 1. Gerar URL de upload para foto de perfil
    print_test "Gerando URL de upload para foto de perfil"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Cookie: access_token=$INFLUENCER_TOKEN" \
        -d '{
            "fileName": "profile.jpg",
            "fileType": "image/jpeg"
        }' \
        "${API_URL}/media/profile-picture/upload-url")
    
    if echo "$response" | grep -q "uploadUrl"; then
        print_success "URL de upload gerada com sucesso"
        # Extrair key do response
        UPLOAD_KEY=$(echo "$response" | grep -o '"key":"[^"]*' | cut -d'"' -f4)
        print_info "Key: $UPLOAD_KEY"
    else
        print_error "Falha ao gerar URL: $response"
    fi
    
    # 2. Confirmar upload de foto (simulado)
    print_test "Confirmando upload de foto de perfil"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Cookie: access_token=$INFLUENCER_TOKEN" \
        -d "{\"key\":\"$UPLOAD_KEY\"}" \
        "${API_URL}/media/profile-picture/confirm")
    
    if echo "$response" | grep -q "Arquivo não encontrado"; then
        print_info "Esperado: arquivo não existe no R2 (upload simulado)"
    else
        print_error "Resposta inesperada: $response"
    fi
    
    # 3. Tentar upload genérico (deve falhar)
    print_test "Tentando upload genérico como influencer (deve falhar)"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Cookie: access_token=$INFLUENCER_TOKEN" \
        -d '{
            "fileName": "document.pdf",
            "fileType": "application/pdf"
        }' \
        "${API_URL}/media/upload-url")
    
    if echo "$response" | grep -q "Sem permissão"; then
        print_success "Bloqueado corretamente: sem permissão"
    else
        print_error "Falha na segurança: $response"
    fi
    
    # 4. Tentar listar arquivos (deve falhar)
    print_test "Tentando listar arquivos como influencer (deve falhar)"
    response=$(curl -s -X GET \
        -H "Cookie: access_token=$INFLUENCER_TOKEN" \
        "${API_URL}/media/list")
    
    if echo "$response" | grep -q "Sem permissão"; then
        print_success "Bloqueado corretamente: sem permissão"
    else
        print_error "Falha na segurança: $response"
    fi
    
    # 5. Gerar URL de download para próprio arquivo
    print_test "Gerando URL de download para próprio arquivo"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Cookie: access_token=$INFLUENCER_TOKEN" \
        -d "{\"key\":\"users/INF1001/profile-picture.jpg\"}" \
        "${API_URL}/media/download-url")
    
    if echo "$response" | grep -q "downloadUrl"; then
        print_success "URL de download gerada"
    else
        print_info "Resposta: $response"
    fi
    
    # 6. Tentar acessar arquivo de outro usuário (deve falhar)
    print_test "Tentando acessar arquivo de outro usuário (deve falhar)"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Cookie: access_token=$INFLUENCER_TOKEN" \
        -d '{
            "key": "users/INF9999/profile-picture.jpg"
        }' \
        "${API_URL}/media/download-url")
    
    if echo "$response" | grep -q "Sem permissão"; then
        print_success "Bloqueado corretamente: sem permissão"
    else
        print_error "Falha na segurança: $response"
    fi
}

# ============================================
# TESTES PARA ADMIN
# ============================================
test_admin() {
    echo -e "\n${YELLOW}═══════════════════════════════════════════${NC}"
    echo -e "${YELLOW}         TESTES PARA ADMIN                 ${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
    
    # Login como admin
    ADMIN_TOKEN=$(login "admin@test.com" "Admin@123" "admin")
    
    if [ -z "$ADMIN_TOKEN" ]; then
        print_error "Não foi possível obter token de admin"
        return
    fi
    
    # 1. Upload genérico
    print_test "Gerando URL de upload genérico"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Cookie: access_token=$ADMIN_TOKEN" \
        -d '{
            "fileName": "report.pdf",
            "fileType": "application/pdf",
            "path": "documents/reports"
        }' \
        "${API_URL}/media/upload-url")
    
    if echo "$response" | grep -q "uploadUrl"; then
        print_success "URL de upload gerada com sucesso"
        UPLOAD_KEY=$(echo "$response" | grep -o '"key":"[^"]*' | cut -d'"' -f4)
        print_info "Key: $UPLOAD_KEY"
    else
        print_error "Falha ao gerar URL: $response"
    fi
    
    # 2. Listar arquivos
    print_test "Listando arquivos"
    response=$(curl -s -X GET \
        -H "Cookie: access_token=$ADMIN_TOKEN" \
        "${API_URL}/media/list?prefix=documents&maxKeys=10")
    
    if echo "$response" | grep -q "files"; then
        print_success "Listagem realizada com sucesso"
    else
        print_error "Falha na listagem: $response"
    fi
    
    # 3. Iniciar upload multipart
    print_test "Iniciando upload multipart"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Cookie: access_token=$ADMIN_TOKEN" \
        -d '{
            "fileName": "large-video.mp4",
            "fileType": "video/mp4"
        }' \
        "${API_URL}/media/multipart/init")
    
    if echo "$response" | grep -q "uploadId"; then
        print_success "Upload multipart iniciado"
        UPLOAD_ID=$(echo "$response" | grep -o '"uploadId":"[^"]*' | cut -d'"' -f4)
        MULTIPART_KEY=$(echo "$response" | grep -o '"key":"[^"]*' | cut -d'"' -f4)
        print_info "UploadId: $UPLOAD_ID"
        print_info "Key: $MULTIPART_KEY"
        
        # 4. Gerar URL para parte 1
        print_test "Gerando URL para parte 1"
        response=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "Cookie: access_token=$ADMIN_TOKEN" \
            -d "{
                \"key\": \"$MULTIPART_KEY\",
                \"uploadId\": \"$UPLOAD_ID\",
                \"partNumber\": 1
            }" \
            "${API_URL}/media/multipart/part-url")
        
        if echo "$response" | grep -q "uploadUrl"; then
            print_success "URL da parte 1 gerada"
        else
            print_error "Falha ao gerar URL da parte: $response"
        fi
        
        # 5. Completar upload multipart (simulado)
        print_test "Completando upload multipart"
        response=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "Cookie: access_token=$ADMIN_TOKEN" \
            -d "{
                \"key\": \"$MULTIPART_KEY\",
                \"uploadId\": \"$UPLOAD_ID\",
                \"parts\": [
                    {\"ETag\": \"etag-simulado-1\", \"PartNumber\": 1},
                    {\"ETag\": \"etag-simulado-2\", \"PartNumber\": 2}
                ]
            }" \
            "${API_URL}/media/multipart/complete")
        
        print_info "Resposta: $response"
        
    else
        print_error "Falha ao iniciar multipart: $response"
    fi
    
    # 6. Deletar arquivo
    print_test "Deletando arquivo"
    response=$(curl -s -X DELETE \
        -H "Content-Type: application/json" \
        -H "Cookie: access_token=$ADMIN_TOKEN" \
        -d "{\"key\":\"$UPLOAD_KEY\"}" \
        "${API_URL}/media/delete")
    
    if echo "$response" | grep -q "sucesso"; then
        print_success "Arquivo deletado (ou tentativa realizada)"
    else
        print_error "Falha ao deletar: $response"
    fi
}

# ============================================
# TESTES SEM AUTENTICAÇÃO
# ============================================
test_no_auth() {
    echo -e "\n${YELLOW}═══════════════════════════════════════════${NC}"
    echo -e "${YELLOW}     TESTES SEM AUTENTICAÇÃO               ${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
    
    # 1. Tentar gerar URL de upload sem token
    print_test "Tentando gerar URL sem autenticação"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d '{
            "fileName": "test.jpg",
            "fileType": "image/jpeg"
        }' \
        "${API_URL}/media/profile-picture/upload-url")
    
    if echo "$response" | grep -q "Token não encontrado"; then
        print_success "Bloqueado corretamente: sem autenticação"
    else
        print_error "Falha na segurança: $response"
    fi
    
    # 2. Tentar listar arquivos sem token
    print_test "Tentando listar arquivos sem autenticação"
    response=$(curl -s -X GET "${API_URL}/media/list")
    
    if echo "$response" | grep -q "Token não encontrado"; then
        print_success "Bloqueado corretamente: sem autenticação"
    else
        print_error "Falha na segurança: $response"
    fi
}

# ============================================
# TESTES DE VALIDAÇÃO
# ============================================
test_validation() {
    echo -e "\n${YELLOW}═══════════════════════════════════════════${NC}"
    echo -e "${YELLOW}       TESTES DE VALIDAÇÃO                 ${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
    
    # Usar token de influencer para testes
    if [ -z "$INFLUENCER_TOKEN" ]; then
        INFLUENCER_TOKEN=$(login "influencer@test.com" "Test@123" "influencer")
    fi
    
    # 1. Tipo de arquivo não permitido
    print_test "Tentando upload com tipo não permitido"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Cookie: access_token=$INFLUENCER_TOKEN" \
        -d '{
            "fileName": "script.exe",
            "fileType": "application/exe"
        }' \
        "${API_URL}/media/profile-picture/upload-url")
    
    if echo "$response" | grep -q "Tipo de arquivo não permitido"; then
        print_success "Validação funcionando: tipo não permitido"
    else
        print_error "Falha na validação: $response"
    fi
    
    # 2. Parâmetros faltando
    print_test "Enviando requisição sem fileName"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Cookie: access_token=$INFLUENCER_TOKEN" \
        -d '{
            "fileType": "image/jpeg"
        }' \
        "${API_URL}/media/profile-picture/upload-url")
    
    if echo "$response" | grep -q "erro"; then
        print_success "Validação funcionando: parâmetro obrigatório"
    else
        print_error "Falha na validação: $response"
    fi
}

# ============================================
# EXECUÇÃO PRINCIPAL
# ============================================
main() {
    echo -e "${BLUE}╔═══════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     TESTES DE ENDPOINTS DE MÍDIA R2       ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════╝${NC}"
    
    # Limpar arquivo de cookies antigo
    rm -f cookies.txt
    
    # Configurar usuários de teste
    setup_test_users
    
    # Executar testes
    test_no_auth
    test_influencer
    test_admin
    test_validation
    
    # Limpar
    rm -f cookies.txt
    
    echo -e "\n${GREEN}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}         TESTES CONCLUÍDOS!                ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
}

# Executar
main
