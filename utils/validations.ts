// Validações utilitárias para os schemas

/**
 * Valida CPF brasileiro
 */
export function validateCPF(cpf: string): boolean {
  if (!cpf) return false;
  
  // Remove caracteres não numéricos
  cpf = cpf.replace(/[^\d]/g, '');
  
  // Verifica se tem 11 dígitos
  if (cpf.length !== 11) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  
  // Validação do primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9))) return false;
  
  // Validação do segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(10))) return false;
  
  return true;
}

/**
 * Valida CNPJ brasileiro
 */
export function validateCNPJ(cnpj: string): boolean {
  if (!cnpj) return false;
  
  // Remove caracteres não numéricos
  cnpj = cnpj.replace(/[^\d]/g, '');
  
  // Verifica se tem 14 dígitos
  if (cnpj.length !== 14) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  
  // Validação dos dígitos verificadores
  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  const digitos = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  if (resultado !== parseInt(digitos.charAt(0))) return false;
  
  tamanho = tamanho + 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  if (resultado !== parseInt(digitos.charAt(1))) return false;
  
  return true;
}

/**
 * Valida número de telefone brasileiro
 */
export function validatePhone(phone: string, options: { 
  allowSpecial?: boolean;
  mobileOnly?: boolean;
  landlineOnly?: boolean;
} = {}): boolean {
  if (!phone) return false;
  
  // Remove caracteres especiais se não permitidos
  if (!options.allowSpecial) {
    phone = phone.replace(/[^\d]/g, '');
  }
  
  // Verifica o tamanho
  const cleanPhone = phone.replace(/[^\d]/g, '');
  
  if (options.mobileOnly) {
    return cleanPhone.length === 11 && cleanPhone[2] === '9';
  }
  
  if (options.landlineOnly) {
    return cleanPhone.length === 10;
  }
  
  return cleanPhone.length === 10 || cleanPhone.length === 11;
}

/**
 * Valida CEP brasileiro
 */
export function validateCEP(cep: string): boolean {
  if (!cep) return false;
  
  // Remove caracteres não numéricos
  cep = cep.replace(/[^\d]/g, '');
  
  // Verifica se tem 8 dígitos
  return cep.length === 8;
}

/**
 * Valida email
 */
export function validateEmail(email: string): boolean {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Valida username do Instagram
 */
export function validateInstagram(username: string): boolean {
  if (!username) return false;
  // Instagram: até 30 caracteres, letras, números, pontos e underscores
  const re = /^[a-zA-Z0-9._]{1,30}$/;
  return re.test(username);
}

/**
 * Valida URL
 */
export function validateUrl(url: string, options: {
  requireProtocol?: boolean;
  protocols?: string[];
} = {}): boolean {
  if (!url) return false;
  
  try {
    const urlObj = new URL(url);
    
    if (options.protocols && !options.protocols.includes(urlObj.protocol)) {
      return false;
    }
    
    return true;
  } catch {
    // Se falhou ao criar URL, tenta adicionar protocolo
    if (!options.requireProtocol && !url.includes('://')) {
      return validateUrl(`http://${url}`, { requireProtocol: true });
    }
    return false;
  }
}

/**
 * Valida número positivo
 */
export function validatePositiveNumber(value: number): boolean {
  return typeof value === 'number' && value >= 0;
}

/**
 * Valida porcentagem (0-100)
 */
export function validatePercentage(value: number): boolean {
  return typeof value === 'number' && value >= 0 && value <= 100;
}

/**
 * Valida data
 */
export function validateDate(date: Date | string, options: {
  allowFuture?: boolean;
  allowPast?: boolean;
  minAge?: number;
  maxAge?: number;
  min?: Date;
  max?: Date;
} = { allowFuture: true, allowPast: true }): boolean {
  if (!date) return false;
  
  const dateObj = date instanceof Date ? date : new Date(date);
  
  if (isNaN(dateObj.getTime())) return false;
  
  const now = new Date();
  
  if (!options.allowFuture && dateObj > now) return false;
  if (!options.allowPast && dateObj < now) return false;
  
  if (options.min && dateObj < options.min) return false;
  if (options.max && dateObj > options.max) return false;
  
  if (options.minAge !== undefined || options.maxAge !== undefined) {
    const age = Math.floor((now.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    if (options.minAge !== undefined && age < options.minAge) return false;
    if (options.maxAge !== undefined && age > options.maxAge) return false;
  }
  
  return true;
}

/**
 * Valida senha
 */
export function validatePassword(password: string, options: {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
  disallowRepeatingChars?: boolean;
  disallowSequentialChars?: boolean;
} = {
  minLength: 6,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!password) {
    errors.push('Senha é obrigatória');
    return { isValid: false, errors };
  }
  
  if (options.minLength && password.length < options.minLength) {
    errors.push(`Senha deve ter no mínimo ${options.minLength} caracteres`);
  }
  
  if (options.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Senha deve conter pelo menos uma letra maiúscula');
  }
  
  if (options.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Senha deve conter pelo menos uma letra minúscula');
  }
  
  if (options.requireNumbers && !/\d/.test(password)) {
    errors.push('Senha deve conter pelo menos um número');
  }
  
  if (options.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Senha deve conter pelo menos um caractere especial');
  }
  
  if (options.disallowRepeatingChars && /(.)\1{2,}/.test(password)) {
    errors.push('Senha não pode conter caracteres repetidos consecutivamente');
  }
  
  if (options.disallowSequentialChars) {
    const sequences = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
    for (const seq of sequences) {
      for (let i = 0; i < password.length - 2; i++) {
        const substr = password.substring(i, i + 3).toLowerCase();
        if (seq.includes(substr)) {
          errors.push('Senha não pode conter sequências óbvias');
          break;
        }
      }
    }
  }
  
  return { isValid: errors.length === 0, errors };
}
