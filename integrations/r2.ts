/**
 * SDK para Cloudflare R2 - TypeScript
 * Gerencia uploads (incluindo multipart), downloads, listagem, exclusão de objetos
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBucketUrl?: string;
  region?: string;
}

export interface Part {
  ETag: string;
  PartNumber: number;
}

export interface GetObjectResponse {
  body: Readable;
  metadata?: Record<string, string>;
  contentType?: string;
  contentLength?: number;
  lastModified?: Date;
}

export class R2Client {
  private bucketName: string;
  private publicBucketUrl: string | null;
  private s3Client: S3Client;

  constructor(config: R2Config) {
    if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
      throw new Error('Configuração incompleta para R2Client: accountId, accessKeyId, secretAccessKey, e bucketName são obrigatórios.');
    }
    
    this.bucketName = config.bucketName;
    this.publicBucketUrl = config.publicBucketUrl ? config.publicBucketUrl.replace(/\/$/, '') : null;
    this.s3Client = new S3Client({
      region: config.region || 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * Gera uma URL pré-assinada para upload de um objeto (single PUT).
   */
  async generatePresignedUploadUrl(key: string, contentType: string, expiresInSeconds: number = 3600): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Inicia um upload multipart e retorna o UploadId.
   */
  async createMultipartUpload(key: string, contentType: string): Promise<{ uploadId: string; key: string }> {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });
    
    const response = await this.s3Client.send(command);
    if (!response.UploadId) {
      throw new Error('Falha ao iniciar upload multipart: UploadId não retornado.');
    }
    
    return {
      uploadId: response.UploadId,
      key: key,
    };
  }

  /**
   * Gera uma URL pré-assinada para o upload de uma parte específica de um upload multipart.
   */
  async generatePresignedUploadPartUrl(
    key: string, 
    uploadId: string, 
    partNumber: number, 
    expiresInSeconds: number = 3600
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucketName,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Completa um upload multipart após todas as partes serem enviadas.
   */
  async completeMultipartUpload(key: string, uploadId: string, parts: Part[]): Promise<any> {
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucketName,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
      },
    });
    return this.s3Client.send(command);
  }

  /**
   * Aborta um upload multipart.
   */
  async abortMultipartUpload(key: string, uploadId: string): Promise<any> {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucketName,
      Key: key,
      UploadId: uploadId,
    });
    return this.s3Client.send(command);
  }

  /**
   * Gera uma URL pré-assinada para download de um objeto.
   */
  async generatePresignedDownloadUrl(key: string, expiresInSeconds: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Retorna a URL pública de um objeto, se o publicBucketUrl estiver configurado.
   */
  getPublicUrl(key: string): string | null {
    if (!this.publicBucketUrl) {
      return null;
    }
    return `${this.publicBucketUrl}/${key.startsWith('/') ? key.substring(1) : key}`;
  }

  /**
   * Faz upload de um objeto (Buffer ou Stream) para a R2 (single PUT).
   */
  async putObject(
    key: string, 
    body: Buffer | Readable | string, 
    contentType: string, 
    metadata: Record<string, string> = {}
  ): Promise<any> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    });
    return this.s3Client.send(command);
  }

  /**
   * Obtém um objeto da R2.
   */
  async getObject(key: string): Promise<GetObjectResponse> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    const response = await this.s3Client.send(command);
    
    return {
      body: response.Body as Readable,
      metadata: response.Metadata,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
    };
  }

  /**
   * Obtém os metadados de um objeto sem baixar o corpo.
   */
  async headObject(key: string): Promise<any> {
    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return this.s3Client.send(command);
  }

  /**
   * Deleta um objeto da R2.
   */
  async deleteObject(key: string): Promise<any> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return this.s3Client.send(command);
  }

  /**
   * Lista objetos em um bucket (ou com um prefixo).
   */
  async listObjects(
    prefix?: string, 
    continuationToken?: string, 
    maxKeys: number = 1000
  ): Promise<any> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: maxKeys,
    });
    return this.s3Client.send(command);
  }
}

// Singleton instance
let r2Instance: R2Client | null = null;

export function getR2Client(): R2Client {
  if (!r2Instance) {
    // Verificar se as variáveis de ambiente estão configuradas
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || 
        !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
      throw new Error(
        'Configuração R2 incompleta. Verifique as variáveis de ambiente: ' +
        'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME'
      );
    }
    
    const config: R2Config = {
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucketName: process.env.R2_BUCKET_NAME,
      publicBucketUrl: process.env.R2_PUBLIC_URL,
      region: process.env.R2_REGION || 'auto'
    };
    
    r2Instance = new R2Client(config);
  }
  
  return r2Instance;
}
