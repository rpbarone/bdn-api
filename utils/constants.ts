// Constantes e configurações do sistema

// Constantes e configurações do sistema

/**
 * Configurações de validação de senha
 * 
 * Requisitos de senha:
 * - Mínimo de 8 caracteres
 * - Pelo menos uma letra maiúscula (A-Z)
 * - Pelo menos uma letra minúscula (a-z)
 * - Pelo menos um número (0-9)
 * - Pelo menos um caractere especial (!@#$%^&*(),.?":{}|<>)
 * - Não pode ter caracteres repetidos consecutivamente (ex: aaa, 111)
 * - Não pode ter sequências óbvias (ex: 123, abc, qwerty)
 * 
 * Exemplos de senhas válidas:
 * - Senha@123 ✓
 * - MyP@ssw0rd! ✓
 * - Secure#2024 ✓
 * 
 * Exemplos de senhas inválidas:
 * - senha123 ✗ (falta maiúscula e caractere especial)
 * - SENHA@123 ✗ (falta minúscula)
 * - Senha@aaa ✗ (caracteres repetidos)
 * - Senha@123abc ✗ (sequência óbvia)
 */
export const PASSWORD_VALIDATION_OPTIONS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  disallowRepeatingChars: true,
  disallowSequentialChars: true
};

/**
 * Configurações de segurança
 */
export const SECURITY_CONFIG = {
  // Tempo de expiração do token de reset de senha (30 minutos)
  PASSWORD_RESET_EXPIRATION: 30 * 60 * 1000,
  
  // Número de tentativas de login antes de bloquear
  MAX_LOGIN_ATTEMPTS: 5,
  
  // Tempo de bloqueio após exceder tentativas (15 minutos)
  LOGIN_LOCK_TIME: 15 * 60 * 1000,
  
  // Salt rounds para bcrypt
  BCRYPT_SALT_ROUNDS: 10
};
