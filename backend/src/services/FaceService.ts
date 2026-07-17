import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * @deprecated The FaceEmbedding database table is deprecated. Biometrics are now managed on the FaceMark staging server.
 */
// FaceEmbedding table is deprecated and direct local queries are disabled.

export class FaceService {
  private static getApiBase(): string {
    return (process.env.FACEMARK_API_BASE || 'https://api.facemark.app.cloudshiftsolutions.in').replace(/\/$/, '');
  }

  private static getBearerToken(): string {
    return process.env.FACEMARK_BEARER_TOKEN || '';
  }

  /**
   * Registers multiple face templates for a user on the FaceMark staging server.
   * Path: POST /api/face/register-multiple/{user_id}
   */
  public static async enrollUserFaces(userId: string, images: Buffer[]): Promise<void> {
    if (images.length === 0) {
      throw new Error('At least one face sample is required for enrollment.');
    }

    const apiBase = this.getApiBase();
    const token = this.getBearerToken();

    const formData = new globalThis.FormData();
    for (let i = 0; i < images.length; i++) {
      const blob = new globalThis.Blob([images[i]], { type: 'image/jpeg' });
      formData.append('files', blob, `sample_${i}.jpg`);
    }

    const url = `${apiBase}/api/face/register-multiple/${userId}`;
    const headers: Record<string, string> = {};
    if (token && token.trim().length > 0 && token !== 'your_staging_bearer_token_here') {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`FaceMark enrollment failed (HTTP ${response.status}): ${errText}`);
    }
  }

  /**
   * Performs face recognition using FaceMark staging API.
   * Path: POST /api/face/recognize
   */
  public static async recognizeFace(imageBuffer: Buffer): Promise<{ userId: string; confidence: number }> {
    const apiBase = this.getApiBase();
    const formData = new globalThis.FormData();
    const blob = new globalThis.Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('file', blob, 'capture.jpg');

    const url = `${apiBase}/api/face/recognize`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`FaceMark recognition failed (HTTP ${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    const recognizedId = data.userId || data.user_id || data.id || (data.user && (data.user.id || data.user.userId));
    const confidence = typeof data.confidence === 'number' ? data.confidence : (typeof data.similarity === 'number' ? data.similarity : 1.0);

    if (!recognizedId) {
      throw new Error('Face not recognized. Please register first.');
    }

    return {
      userId: recognizedId,
      confidence
    };
  }

  /**
   * Verifies if a captured face matches a target user ID using recognize endpoint
   */
  public static async verifyUserFace(userId: string, imageBuffer: Buffer): Promise<{ isMatch: boolean; confidence: number }> {
    try {
      const match = await this.recognizeFace(imageBuffer);
      const isMatch = match.userId.toLowerCase() === userId.toLowerCase();
      return {
        isMatch,
        confidence: match.confidence
      };
    } catch (err: any) {
      return {
        isMatch: false,
        confidence: 0
      };
    }
  }
}
