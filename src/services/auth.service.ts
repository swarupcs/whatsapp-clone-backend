import mongoose from 'mongoose';
import { User } from '../models/user.model.js';
import { RefreshToken } from '../models/refreshToken.model.js';
import {
  hashPassword,
  comparePassword,
  generateTokenPair,
  verifyRefreshToken,
  docToPublicUser,
  nowDate,
  getRefreshTokenExpiry,
} from '../helpers/index.js';
import type {
  LoginRequest,
  RegisterRequest,
  AuthTokens,
  PublicUser,
} from '../types/index.js';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface LoginResult {
  user: PublicUser;
  tokens: AuthTokens;
}

export interface RegisterResult {
  user: PublicUser;
  tokens: AuthTokens;
}

// ─── Auth Service ─────────────────────────────────────────────────────────────

export const authService = {
  /**
   * Authenticate a user with email + password.
   */
  async login(data: LoginRequest): Promise<LoginResult | null> {
    const user = await User.findOne({ email: data.email.toLowerCase().trim() });
    if (!user) return null;

    const passwordMatch = await comparePassword(data.password, user.passwordHash);
    if (!passwordMatch) return null;

    // Mark user online
    user.status = 'online';
    user.updatedAt = nowDate();
    await user.save();

    const tokens = generateTokenPair({ userId: user._id.toString(), email: user.email });

    await RefreshToken.create({
      token: tokens.refreshToken,
      userId: user._id,
      expiresAt: getRefreshTokenExpiry(),
    });

    return { user: docToPublicUser(user), tokens };
  },

  /**
   * Register a new user account.
   */
  async register(data: RegisterRequest): Promise<RegisterResult | 'email_taken'> {
    const exists = await User.findOne({ email: data.email.toLowerCase().trim() });
    if (exists) return 'email_taken';

    const passwordHash = await hashPassword(data.password);

    const newUser = await User.create({
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      passwordHash,
      picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(data.email)}`,
      status: 'online',
      about: 'Hey there! I am using WhatsUp',
    });

    const tokens = generateTokenPair({ userId: newUser._id.toString(), email: newUser.email });

    await RefreshToken.create({
      token: tokens.refreshToken,
      userId: newUser._id,
      expiresAt: getRefreshTokenExpiry(),
    });

    return { user: docToPublicUser(newUser), tokens };
  },

  /**
   * Rotate refresh tokens.
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens | null> {
    const stored = await RefreshToken.findOne({ token: refreshToken });
    if (!stored) return null;

    try {
      const payload = verifyRefreshToken(refreshToken);
      const user = await User.findById(payload.userId);
      if (!user) {
        await RefreshToken.deleteOne({ token: refreshToken });
        return null;
      }

      // Rotate: delete old, issue new
      await RefreshToken.deleteOne({ token: refreshToken });
      const tokens = generateTokenPair({ userId: user._id.toString(), email: user.email });

      await RefreshToken.create({
        token: tokens.refreshToken,
        userId: user._id,
        expiresAt: getRefreshTokenExpiry(),
      });

      return tokens;
    } catch {
      await RefreshToken.deleteOne({ token: refreshToken });
      return null;
    }
  },

  /**
   * Logout — invalidate token and set offline.
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await RefreshToken.deleteOne({ token: refreshToken });
    }

    await User.findByIdAndUpdate(userId, {
      status: 'offline',
      updatedAt: nowDate(),
    });
  },

  /**
   * Get currently authenticated user.
   */
  async getMe(userId: string): Promise<PublicUser | null> {
    const user = await User.findById(userId);
    if (!user) return null;
    return docToPublicUser(user);
  },
};
