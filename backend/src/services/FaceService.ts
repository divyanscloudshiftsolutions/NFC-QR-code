import { Jimp } from 'jimp';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class FaceService {
  /**
   * Helper to extract face embedding from an image buffer using pure JS pixel normalization
   */
  public static async getEmbeddingFromImage(imageBuffer: Buffer): Promise<number[]> {
    try {
      const image = await Jimp.read(imageBuffer);

      // Center crop: Since the mobile UI forces the user to align their face in an oval,
      // the face is centered. We crop the central 70% square region.
      const width = image.width;
      const height = image.height;
      const size = Math.min(width, height) * 0.7;
      const x = (width - size) / 2;
      const y = (height - size) / 2;

      image.crop({
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(size),
        h: Math.round(size)
      });
      image.resize({ w: 64, h: 64 });

      // Jimp v1 stores raw pixel data in image.bitmap.data as a Uint8ClampedArray/Buffer of size 64 * 64 * 4
      const data = image.bitmap.data;
      const vector: number[] = [];

      for (let i = 0; i < 4096; i++) {
        const idx = i * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        // Standard Grayscale projection (R = 0.299, G = 0.587, B = 0.114)
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        vector.push(gray);
      }

      // L2 Normalization
      let sumSquare = 0;
      for (const val of vector) {
        sumSquare += val * val;
      }
      const norm = Math.sqrt(sumSquare);

      if (norm < 1e-8) {
        throw new Error('Image too blank or dark to extract features.');
      }

      return vector.map(val => val / norm);
    } catch (error: any) {
      throw new Error(`Face feature extraction failed: ${error.message}`);
    }
  }

  /**
   * Calculates cosine similarity (dot product of L2-normalized vectors)
   */
  public static calculateSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== 4096 || vecB.length !== 4096) {
      throw new Error('Embedding vectors must have length 4096.');
    }
    let dotProduct = 0;
    for (let i = 0; i < 4096; i++) {
      dotProduct += vecA[i] * vecB[i];
    }
    return dotProduct;
  }

  /**
   * Matches a captured face vector against a specific user's enrolled templates
   */
  public static async verifyUserFace(userId: string, capturedVec: number[], threshold = 0.80): Promise<{ isMatch: boolean; confidence: number }> {
    const activeEmbeddings = await prisma.faceEmbedding.findMany({
      where: {
        userId,
        isActive: true
      }
    });

    if (activeEmbeddings.length === 0) {
      throw new Error('No face templates enrolled for this user.');
    }

    let highestSimilarity = 0;

    for (const record of activeEmbeddings) {
      const templateVec: number[] = JSON.parse(record.embeddingVector);
      const similarity = this.calculateSimilarity(capturedVec, templateVec);
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
      }
    }

    return {
      isMatch: highestSimilarity >= threshold,
      confidence: highestSimilarity
    };
  }

  /**
   * Registers multiple face templates for a user
   */
  public static async enrollUserFaces(userId: string, images: Buffer[], s3Urls: string[]): Promise<void> {
    if (images.length === 0) {
      throw new Error('At least one face sample is required for enrollment.');
    }

    // Set previous embeddings to inactive
    await prisma.faceEmbedding.updateMany({
      where: { userId },
      data: { isActive: false }
    });

    for (let i = 0; i < images.length; i++) {
      const embedding = await this.getEmbeddingFromImage(images[i]);
      const s3Url = s3Urls[i] || '';

      await prisma.faceEmbedding.create({
        data: {
          userId,
          embeddingVector: JSON.stringify(embedding),
          referenceImageUrl: s3Url,
          isPrimary: i === 0,
          isActive: true
        }
      });
    }
  }
}
