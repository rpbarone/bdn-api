import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateJWT } from '../middlewares/jwt';
import { getR2Client } from '../integrations/r2';
import User from '../models/User';

export default async function mediaRoutes(fastify: FastifyInstance) {
  const r2Client = getR2Client();

  /**
   * Gera URL pré-assinada para upload de foto de perfil (influencers)
   */
  fastify.post('/profile-picture/upload-url', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['fileName', 'fileType'],
        properties: {
          fileName: { type: 'string' },
          fileType: { type: 'string' },
          fileSize: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    const customReply = reply as any;
    const body = request.body as { fileName: string; fileType: string; fileSize?: number };
    
    try {
      const { fileName, fileType } = body;
      const user = request.user!;

      // Validar tipo de arquivo (apenas imagens)
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(fileType)) {
        return customReply.erro('Tipo de arquivo não permitido. Use JPG, PNG ou WebP.', 400);
      }

      // Gerar chave única para o arquivo
      const fileExtension = fileName.split('.').pop();
      const key = `users/${user.id}/profile-picture.${fileExtension}`;

      // Gerar URL pré-assinada
      const uploadUrl = await r2Client.generatePresignedUploadUrl(key, fileType, 3600);

      return customReply.sucesso({
        uploadUrl,
        key,
        expiresIn: 3600
      }, 'URL de upload gerada com sucesso');
    } catch (error: any) {
      console.error('Erro ao gerar URL de upload:', error);
      return customReply.erro('Erro ao gerar URL de upload', 500, error.message);
    }
  });

  /**
   * Confirma upload de foto de perfil e atualiza banco de dados
   */
  fastify.post('/profile-picture/confirm', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const customReply = reply as any;
    const body = request.body as { key: string };
    
    try {
      const { key } = body;
      const user = request.user!;

      // Verificar se a chave pertence ao usuário
      if (!key.startsWith(`users/${user.id}/profile-picture`)) {
        return customReply.erro('Chave inválida', 400);
      }

      // Verificar se o arquivo existe no R2
      try {
        await r2Client.headObject(key);
      } catch {
        return customReply.erro('Arquivo não encontrado', 404);
      }

      // Deletar foto antiga se existir
      if (user.profilePicture) {
        try {
          await r2Client.deleteObject(user.profilePicture);
        } catch (error) {
          console.error('Erro ao deletar foto antiga:', error);
        }
      }

      // Atualizar usuário com nova foto
      await User.updateOne(
        { _id: user._id },
        { profilePicture: key }
      );

      // Gerar URL pública se disponível
      const publicUrl = r2Client.getPublicUrl(key);

      return customReply.sucesso({
        key,
        publicUrl
      }, 'Foto de perfil atualizada com sucesso');
    } catch (error: any) {
      console.error('Erro ao confirmar upload:', error);
      return customReply.erro('Erro ao confirmar upload', 500);
    }
  });

  /**
   * Gera URL pré-assinada para upload genérico (admins)
   */
  fastify.post('/upload-url', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['fileName', 'fileType'],
        properties: {
          fileName: { type: 'string' },
          fileType: { type: 'string' },
          path: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const customReply = reply as any;
    const body = request.body as { fileName: string; fileType: string; path?: string };
    
    try {
      const { fileName, fileType, path } = body;
      const user = request.user!;

      // Verificar permissão (apenas admin e super_admin)
      if (!['admin', 'super_admin'].includes(user.role)) {
        return customReply.erro('Sem permissão para esta operação', 403);
      }

      // Gerar chave para o arquivo
      const timestamp = Date.now();
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const basePath = path || 'uploads';
      const key = `${basePath}/${timestamp}-${sanitizedFileName}`;

      // Gerar URL pré-assinada
      const uploadUrl = await r2Client.generatePresignedUploadUrl(key, fileType, 3600);

      return customReply.sucesso({
        uploadUrl,
        key,
        expiresIn: 3600
      }, 'URL de upload gerada com sucesso');
    } catch (error: any) {
      console.error('Erro ao gerar URL de upload:', error);
      return customReply.erro('Erro ao gerar URL de upload', 500, error.message);
    }
  });

  /**
   * Inicia upload multipart (para arquivos grandes)
   */
  fastify.post('/multipart/init', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['fileName', 'fileType'],
        properties: {
          fileName: { type: 'string' },
          fileType: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const customReply = reply as any;
    const body = request.body as { fileName: string; fileType: string };
    
    try {
      const { fileName, fileType } = body;
      const user = request.user!;

      // Gerar chave para o arquivo
      const timestamp = Date.now();
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const basePath = user.role === 'influencer' ? `users/${user.id}` : 'uploads/multipart';
      const key = `${basePath}/${timestamp}-${sanitizedFileName}`;

      // Iniciar upload multipart com tratamento de erro melhorado
      try {
        const { uploadId } = await r2Client.createMultipartUpload(key, fileType);

        return customReply.sucesso({
          uploadId,
          key
        }, 'Upload multipart iniciado com sucesso');
      } catch (multipartError: any) {
        console.error('Erro específico do multipart:', multipartError);
        
        // Verificar se é erro de permissão/autenticação
        if (multipartError.name === 'AccessDenied' || multipartError.Code === 'AccessDenied') {
          return customReply.erro('Acesso negado ao bucket R2. Verifique as permissões.', 403);
        }
        
        // Verificar se é erro de configuração
        if (multipartError.name === 'NoSuchBucket' || multipartError.Code === 'NoSuchBucket') {
          return customReply.erro('Bucket R2 não encontrado. Verifique a configuração.', 500);
        }
        
        throw multipartError;
      }
    } catch (error: any) {
      console.error('Erro ao iniciar upload multipart:', error);
      return customReply.erro('Erro ao iniciar upload multipart', 500, error.message);
    }
  });

  /**
   * Gera URL pré-assinada para parte do upload multipart
   */
  fastify.post('/multipart/part-url', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['key', 'uploadId', 'partNumber'],
        properties: {
          key: { type: 'string' },
          uploadId: { type: 'string' },
          partNumber: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    const customReply = reply as any;
    const body = request.body as { key: string; uploadId: string; partNumber: number };
    
    try {
      const { key, uploadId, partNumber } = body;
      const user = request.user!;

      // Verificar se influencer está acessando apenas seus arquivos
      if (user.role === 'influencer' && !key.startsWith(`users/${user.id}/`)) {
        return customReply.erro('Sem permissão para este arquivo', 403);
      }

      // Gerar URL para a parte
      const uploadUrl = await r2Client.generatePresignedUploadPartUrl(key, uploadId, partNumber, 3600);

      return customReply.sucesso({
        uploadUrl,
        partNumber
      }, 'URL de upload de parte gerada com sucesso');
    } catch (error: any) {
      console.error('Erro ao gerar URL de parte:', error);
      return customReply.erro('Erro ao gerar URL de parte', 500, error.message);
    }
  });

  /**
   * Completa upload multipart
   */
  fastify.post('/multipart/complete', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['key', 'uploadId', 'parts'],
        properties: {
          key: { type: 'string' },
          uploadId: { type: 'string' },
          parts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['ETag', 'PartNumber'],
              properties: {
                ETag: { type: 'string' },
                PartNumber: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const customReply = reply as any;
    const body = request.body as { 
      key: string; 
      uploadId: string; 
      parts: Array<{ ETag: string; PartNumber: number }> 
    };
    
    try {
      const { key, uploadId, parts } = body;
      const user = request.user!;

      // Verificar se influencer está acessando apenas seus arquivos
      if (user.role === 'influencer' && !key.startsWith(`users/${user.id}/`)) {
        return customReply.erro('Sem permissão para este arquivo', 403);
      }

      // Completar upload
      const result = await r2Client.completeMultipartUpload(key, uploadId, parts);

      // Gerar URL pública se disponível
      const publicUrl = r2Client.getPublicUrl(key);

      return customReply.sucesso({
        key,
        location: result.Location,
        publicUrl
      }, 'Upload multipart concluído com sucesso');
    } catch (error: any) {
      console.error('Erro ao completar upload multipart:', error);
      return customReply.erro('Erro ao completar upload multipart', 500, error.message);
    }
  });

  /**
   * Gera URL pré-assinada para download
   */
  fastify.post('/download-url', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const customReply = reply as any;
    const body = request.body as { key: string };
    
    try {
      const { key } = body;
      const user = request.user!;

      // Verificar se influencer está acessando apenas seus arquivos
      if (user.role === 'influencer' && !key.startsWith(`users/${user.id}/`)) {
        return customReply.erro('Sem permissão para este arquivo', 403);
      }

      // Gerar URL de download
      const downloadUrl = await r2Client.generatePresignedDownloadUrl(key, 3600);

      return customReply.sucesso({
        downloadUrl,
        expiresIn: 3600
      }, 'URL de download gerada com sucesso');
    } catch (error: any) {
      console.error('Erro ao gerar URL de download:', error);
      return customReply.erro('Erro ao gerar URL de download', 500, error.message);
    }
  });

  /**
   * Lista arquivos (admins)
   */
  fastify.get('/list', {
    preHandler: [authenticateJWT],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          prefix: { type: 'string' },
          continuationToken: { type: 'string' },
          maxKeys: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const customReply = reply as any;
    const query = request.query as { 
      prefix?: string; 
      continuationToken?: string; 
      maxKeys?: string 
    };
    
    try {
      const user = request.user!;
      const { prefix, continuationToken, maxKeys } = query;

      // Verificar permissão (apenas admin e super_admin)
      if (!['admin', 'super_admin'].includes(user.role)) {
        return customReply.erro('Sem permissão para esta operação', 403);
      }

      // Listar objetos com tratamento de erro melhorado
      try {
        const result = await r2Client.listObjects(
          prefix,
          continuationToken,
          maxKeys ? parseInt(maxKeys) : 100
        );

        // Processar resultados
        const files = (result.Contents || []).map((obj: any) => ({
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified,
          publicUrl: r2Client.getPublicUrl(obj.Key)
        }));

        return customReply.sucesso({
          files,
          nextContinuationToken: result.NextContinuationToken,
          isTruncated: result.IsTruncated
        }, 'Arquivos listados com sucesso');
      } catch (listError: any) {
        console.error('Erro específico da listagem:', listError);
        
        // Verificar se é erro de permissão
        if (listError.name === 'AccessDenied' || listError.Code === 'AccessDenied') {
          return customReply.erro('Acesso negado ao bucket R2. Verifique as permissões.', 403);
        }
        
        // Verificar se é erro de bucket não encontrado
        if (listError.name === 'NoSuchBucket' || listError.Code === 'NoSuchBucket') {
          return customReply.erro('Bucket R2 não encontrado. Verifique a configuração.', 500);
        }
        
        // Se for outro erro, retornar lista vazia (bucket pode estar vazio)
        return customReply.sucesso({
          files: [],
          nextContinuationToken: null,
          isTruncated: false
        }, 'Nenhum arquivo encontrado');
      }
    } catch (error: any) {
      console.error('Erro ao listar arquivos:', error);
      return customReply.erro('Erro ao listar arquivos', 500, error.message);
    }
  });

  /**
   * Deleta arquivo (admins ou próprio perfil)
   */
  fastify.delete('/delete', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const customReply = reply as any;
    const body = request.body as { key: string };
    
    try {
      const { key } = body;
      const user = request.user!;

      // Verificar permissões
      if (user.role === 'influencer') {
        // Influencer só pode deletar sua própria foto de perfil
        if (!key.startsWith(`users/${user.id}/profile-picture`)) {
          return customReply.erro('Sem permissão para deletar este arquivo', 403);
        }
      } else if (!['admin', 'super_admin'].includes(user.role)) {
        return customReply.erro('Sem permissão para esta operação', 403);
      }

      // Deletar arquivo
      await r2Client.deleteObject(key);

      // Se for foto de perfil, atualizar usuário
      if (key.includes('profile-picture')) {
        await User.updateOne(
          { profilePicture: key },
          { $unset: { profilePicture: 1 } }
        );
      }

      return customReply.sucesso(null, 'Arquivo deletado com sucesso');
    } catch (error: any) {
      console.error('Erro ao deletar arquivo:', error);
      return customReply.erro('Erro ao deletar arquivo', 500, error.message);
    }
  });

  // Adicionar tratamento de erro de validação do schema
  fastify.setErrorHandler(async (error, request, reply) => {
    const customReply = reply as any;
    
    // Se for erro de validação do schema do Fastify
    if (error.validation) {
      const mensagens = error.validation.map((err: any) => {
        const campo = err.instancePath ? err.instancePath.replace('/', '') : err.params?.missingProperty;
        const tipo = err.keyword;
        
        if (tipo === 'required') {
          return `Campo '${campo}' é obrigatório`;
        } else if (tipo === 'type') {
          return `Campo '${campo}' deve ser do tipo ${err.params?.type}`;
        }
        
        return `Erro de validação no campo '${campo}'`;
      });
      
      return customReply.erro('Erro de validação', 400, mensagens);
    }
    
    // Outros erros são tratados pelo handler global
    throw error;
  });
}
