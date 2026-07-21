import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class FaceMarkError extends Error {
  public code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'FaceMarkError';
  }
}

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

  private static handleFetchError(err: any): never {
    console.error('[FaceMark Fetch Error]:', err);
    const msg = err.message || '';
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      throw new FaceMarkError(
        'NETWORK_ISSUE',
        'Unable to connect to the face verification service. Please check your internet connection and try again.'
      );
    }
    throw new FaceMarkError(
      'UNKNOWN_ERROR',
      'Something went wrong while registering your face. Please try again or contact the administrator if the problem continues.'
    );
  }

  private static async handleResponseError(response: Response, isEnroll: boolean): Promise<never> {
    const status = response.status;
    let errText = '';
    try {
      errText = await response.text();
    } catch (_) {}
    
    console.error(`[FaceMark API Error] Status: ${status}, Body: ${errText}`);

    if (status === 401 || status === 403) {
      throw new FaceMarkError(
        'ACCESS_DENIED',
        'Face verification service access failed. Please contact the administrator.'
      );
    }

    if (status === 502 || status === 503 || status === 504) {
      throw new FaceMarkError(
        'SERVICE_UNAVAILABLE',
        'The face verification service is temporarily unavailable. Please try again after a few minutes.'
      );
    }

    if (status === 422) {
      throw new FaceMarkError(
        'INVALID_IMAGE',
        'The captured photo could not be processed. Please capture your face again.'
      );
    }

    // Inspect body text for specific issues
    const errLower = errText.toLowerCase();
    if (errLower.includes('no face') || errLower.includes('not detect') || errLower.includes('face not found')) {
      throw new FaceMarkError(
        'FACE_NOT_DETECTED',
        "Your face couldn't be detected. Please look directly at the camera and try again."
      );
    }

    if (errLower.includes('blurry') || errLower.includes('quality') || errLower.includes('poor image')) {
      throw new FaceMarkError(
        'POOR_IMAGE_QUALITY',
        "The photo isn't clear enough. Please keep your face steady and try again."
      );
    }

    if (isEnroll) {
      throw new FaceMarkError(
        'UNKNOWN_ERROR',
        'Something went wrong while registering your face. Please try again or contact the administrator if the problem continues.'
      );
    } else {
      throw new FaceMarkError(
        'PROCESSING_ERROR',
        "We couldn't process your request at the moment. Please try again."
      );
    }
  }

  /**
   * Registers multiple face templates for a user on the FaceMark staging server.
   * Path: POST /api/face/register-multiple/{user_id}
   */
  public static async enrollUserFaces(userId: string, images: Buffer[]): Promise<void> {
    if (images.length === 0) {
      throw new FaceMarkError(
        'INVALID_IMAGE',
        'The captured photo could not be processed. Please capture your face again.'
      );
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

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers
      });
    } catch (err: any) {
      return this.handleFetchError(err);
    }

    if (!response.ok) {
      return this.handleResponseError(response, true);
    }
  }

  /**
   * Performs facial recognition using external FaceMark Quick Attendance API.
   * Path: POST /api/attendance/quick
   */
  public static async callQuickAttendanceApi(imageBuffer: Buffer): Promise<{ userId: string; confidence: number; action?: string }> {
    const apiBase = this.getApiBase();
    const token = this.getBearerToken();
    const formData = new globalThis.FormData();
    const blob = new globalThis.Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('file', blob, 'capture.jpg');

    const url = `${apiBase}/api/attendance/quick`;
    const headers: Record<string, string> = {};
    if (token && token.trim().length > 0 && token !== 'your_staging_bearer_token_here') {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers
      });
    } catch (err: any) {
      return this.handleFetchError(err);
    }

    if (!response.ok) {
      // Fallback: If external /api/attendance/quick returns 404 on older FaceMark instance, fallback to /api/face/recognize
      if (response.status === 404) {
        return this.recognizeFace(imageBuffer);
      }
      return this.handleResponseError(response, false);
    }

    let data: any;
    try {
      data = await response.json();
    } catch (err) {
      throw new FaceMarkError(
        'PROCESSING_ERROR',
        "We couldn't process your request at the moment. Please try again."
      );
    }

    const recognizedId = data.userId || data.user_id || data.id || (data.user && (data.user.id || data.user.userId));
    const confidence = typeof data.confidence === 'number' ? data.confidence : (typeof data.similarity === 'number' ? data.similarity : 1.0);
    const action = data.action || data.status;

    if (!recognizedId) {
      throw new FaceMarkError(
        'USER_NOT_REGISTERED',
        'Your face has not been registered yet. Please contact the administrator to complete face registration.'
      );
    }

    return {
      userId: recognizedId,
      confidence,
      action
    };
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
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        body: formData
      });
    } catch (err: any) {
      return this.handleFetchError(err);
    }

    if (!response.ok) {
      return this.handleResponseError(response, false);
    }

    let data: any;
    try {
      data = await response.json();
    } catch (err) {
      throw new FaceMarkError(
        'PROCESSING_ERROR',
        "We couldn't process your request at the moment. Please try again."
      );
    }

    const recognizedId = data.userId || data.user_id || data.id || (data.user && (data.user.id || data.user.userId));
    const confidence = typeof data.confidence === 'number' ? data.confidence : (typeof data.similarity === 'number' ? data.similarity : 1.0);

    if (!recognizedId) {
      throw new FaceMarkError(
        'USER_NOT_REGISTERED',
        'Your face has not been registered yet. Please contact the administrator to complete face registration.'
      );
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
    const match = await this.callQuickAttendanceApi(imageBuffer);
    const isMatch = match.userId.toLowerCase() === userId.toLowerCase();
    if (!isMatch) {
      throw new FaceMarkError(
        'USER_ID_MISMATCH',
        'The captured face does not match the selected employee. Please verify and try again.'
      );
    }
    return {
      isMatch,
      confidence: match.confidence
    };
  }
}
