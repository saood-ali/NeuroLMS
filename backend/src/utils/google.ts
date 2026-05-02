import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { ApiError } from './ApiError';

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export interface GooglePayload {
  email: string;
  name: string;
  sub: string;
  picture?: string;
}

export const verifyGoogleToken = async (idToken: string): Promise<GooglePayload> => {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new ApiError(500, 'Google Sign-In is not configured on the server');
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.sub) {
      throw new Error('Invalid payload structure');
    }
    
    return {
      email: payload.email,
      name: payload.name || 'Google User',
      sub: payload.sub,
      picture: payload.picture,
    };
  } catch (error) {
    throw new ApiError(401, 'Invalid Google ID Token');
  }
};
