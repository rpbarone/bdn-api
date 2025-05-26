import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateJWT } from '../middlewares/jwt';
import { getR2Client } from '../integrations/r2';
import User from '../models/User';

interface UploadRequest {
  Body: {
    fileName: string;
    fileType: string;
    fileSize?: number;
  };
}

interface MultipartInitRequest {
  Body: {
    fileName: string;
    fileType: string;
  };
}

interface MultipartUrlRequest {
  Body: {
    key: string;
    uploadId: string;
    partNumber: number;
  };
}

interface MultipartCompleteRequest {
  Body: {
    key: string;
    uploadId: string;
    parts: Array<{
      ETag: string;
      PartNumber: number;
    }>;
  };
}

interface DeleteRequest {
  Body: {
    key: string;
  };
}

interface ListRequest {
  Querystring: {
    prefix?: string;
    continuationToken?: string;
    maxKeys?: string;
  };
}

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
  }, async (request: FastifyRequest<UploadRequest>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const { fileName, fileType } = request.body;
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
      return customReply.erro('Erro ao gerar URL de upload', 500);
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
  }, async (request: FastifyRequest<{ Body: { key: string } }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const { key } = request.body;
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
  }, async (request: FastifyRequest<UploadRequest & { Body: { path?: string } }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const { fileName, fileType, path } = request.body;
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
      return customReply.erro('Erro ao gerar URL de upload', 500);
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
  }, async (request: FastifyRequest<MultipartInitRequest>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const { fileName, fileType } = request.body;
      const user = request.user!;

      // Gerar chave para o arquivo
      const timestamp = Date.now();
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const basePath = user.role === 'influencer' ? `users/${user.id}` : 'uploads/multipart';
      const key = `${basePath}/${timestamp}-${sanitizedFileName}`;

      // Iniciar upload multipart
      const { uploadId } = await r2Client.createMultipartUpload(key, fileType);

      return customReply.sucesso({
        uploadId,
        key
      }, 'Upload multipart iniciado com sucesso');
    } catch (error: any) {
      console.error('Erro ao iniciar upload multipart:', error);
      return customReply.erro('Erro ao iniciar upload multipart', 500);
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
  }, async (request: FastifyRequest<MultipartUrlRequest>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const { key, uploadId, partNumber } = request.body;
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
      return customReply.erro('Erro ao gerar URL de parte', 500);
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
  }, async (request: FastifyRequest<MultipartCompleteRequest>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const { key, uploadId, parts } = request.body;
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
      return customReply.erro('Erro ao completar upload multipart', 500);
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
  }, async (request: FastifyRequest<{ Body: { key: string } }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const { key } = request.body;
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
      return customReply.erro('Erro ao gerar URL de download', 500);
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
  }, async (request: FastifyRequest<ListRequest>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const user = request.user!;
      const { prefix, continuationToken, maxKeys } = request.query;

      // Verificar permissão (apenas admin e super_admin)
      if (!['admin', 'super_admin'].includes(user.role)) {
        return customReply.erro('Sem permissão para esta operação', 403);
      }

      // Listar objetos
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
    } catch (error: any) {
      console.error('Erro ao listar arquivos:', error);
      return customReply.erro('Erro ao listar arquivos', 500);
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
  }, async (request: FastifyRequest<DeleteRequest>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const { key } = request.body;
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
      return customReply.erro('Erro ao deletar arquivo', 500);
    }
  });
}
