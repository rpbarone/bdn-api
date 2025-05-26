# Melhorias de Segurança para Códigos de Backup 2FA

## 1. Hash dos Códigos de Backup

Atualmente os códigos são armazenados em texto plano. Uma melhoria seria hashear:

```javascript
// Em User.js - ao gerar códigos
const backupCodes = Array.from({ length: 8 }, () => {
  const code = generateAlphanumericCode(8); // Aumentar para 8 caracteres
  return {
    plain: code, // Para mostrar ao usuário
    hashed: bcrypt.hashSync(code, 10) // Para armazenar
  };
});

// Armazenar apenas os hashes
user.twoFactorBackupCodes = backupCodes.map(c => c.hashed);

// Retornar códigos em texto plano apenas na criação
return {
  backupCodes: backupCodes.map(c => c.plain)
};
```

## 2. Rate Limiting para Tentativas

Adicionar limite de tentativas de códigos de backup:

```javascript
// No modelo User
twoFactorBackupAttempts: {
  type: Number,
  default: 0
},
twoFactorBackupLastAttempt: {
  type: Date
},

// Na verificação
if (user.twoFactorBackupAttempts >= 5) {
  const timeSinceLastAttempt = Date.now() - user.twoFactorBackupLastAttempt;
  if (timeSinceLastAttempt < 15 * 60 * 1000) { // 15 minutos
    return customReply.erro('Muitas tentativas. Tente novamente em 15 minutos', 429);
  }
  // Reset contador após 15 minutos
  user.twoFactorBackupAttempts = 0;
}
```

## 3. Notificação de Uso

Enviar email quando código de backup for usado:

```javascript
// Após uso bem-sucedido do código
await postmark.sendSecurityAlert(
  user.email,
  user.name,
  'Código de backup 2FA utilizado',
  `Um código de backup foi usado para acessar sua conta. 
   Restam ${user.twoFactorBackupCodes.length} códigos.
   Se não foi você, altere sua senha imediatamente.`
);
```

## 4. Regeneração de Códigos

Permitir que admin regenere códigos de backup:

```javascript
// Novo endpoint
fastify.post('/2fa/regenerate-backup-codes', {
  preHandler: [authenticateJWT],
  schema: {
    body: {
      type: 'object',
      required: ['password', 'twoFactorCode'],
      properties: {
        password: { type: 'string' },
        twoFactorCode: { type: 'string' }
      }
    }
  }
}, async (request, reply) => {
  // Verificar senha E código 2FA atual
  // Gerar novos códigos
  // Invalidar códigos antigos
  // Enviar por email
});
```

## 5. Códigos com Expiração

Adicionar validade aos códigos:

```javascript
twoFactorBackupCodes: [{
  code: { type: String, select: false },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { 
    type: Date, 
    default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 ano
  }
}],

// Na verificação
const validBackup = user.twoFactorBackupCodes.find(
  backup => backup.code === hashedInput && backup.expiresAt > new Date()
);
```

## 6. Auditoria de Uso

Registrar todos os usos de códigos de backup:

```javascript
// Modelo BackupCodeUsage
const BackupCodeUsageSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  usedAt: { type: Date, default: Date.now },
  ipAddress: String,
  userAgent: String,
  success: Boolean,
  remainingCodes: Number
});

// Registrar uso
await BackupCodeUsage.create({
  userId: user._id,
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'],
  success: true,
  remainingCodes: user.twoFactorBackupCodes.length
});
```

## 7. Complexidade Aumentada

- Aumentar para 8-10 caracteres
- Incluir caracteres especiais opcionalmente
- Formato mais legível: `XXXX-XXXX-XXXX`

```javascript
function generateSecureBackupCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  
  return code; // Ex: "A7B3-K9M2-X5P8"
}
```

## 8. Interface de Gerenciamento

Criar interface para super_admin gerenciar códigos de backup:

- Ver quantos códigos restam para cada admin
- Forçar regeneração em emergências
- Ver histórico de uso
- Alertas quando admin tem poucos códigos restantes

## Implementação Prioritária

Para implementação imediata, sugiro:

1. **Hash dos códigos** (segurança crítica)
2. **Rate limiting** (prevenir força bruta)
3. **Notificação de uso** (detecção de comprometimento)
4. **Aumentar complexidade** para 8 caracteres

Essas mudanças manteriam a usabilidade enquanto aumentam significativamente a segurança.
