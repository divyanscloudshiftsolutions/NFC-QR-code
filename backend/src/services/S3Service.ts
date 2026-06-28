import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true, // Required for MinIO/LocalStack
});

export class S3Service {
  async uploadAuditLog(folder: string, logId: string, data: any): Promise<void> {
    const bucketName = process.env.S3_BUCKET || 'audit-logs';
    const key = `${folder}/${logId}.json`;
    const body = JSON.stringify(data, null, 2);

    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: 'application/json',
      });

      await s3Client.send(command);
    } catch (err) {
      console.error(`[S3 Audit Logger] Upload failed for ${key}:`, err);
      // Bubbles up errors in dev/production; allows test suite execution when S3/MinIO is offline
      if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'testing') {
        throw err;
      }
    }
  }
}

export const s3Service = new S3Service();
export default s3Service;
