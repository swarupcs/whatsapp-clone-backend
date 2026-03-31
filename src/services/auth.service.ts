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

export interface LoginResult {
  user: PublicUser;
  tokens: AuthTokens;
}

export interface RegisterResult {
  user: PublicUser;
  tokens: AuthTokens;
}

export const authService = {
  async login(data: LoginRequest): Promise<LoginResult | null> {
    const user = await User.findOne({ email: data.email.toLowerCase().trim() });
    if (!user) return null;

    const passwordMatch = await comparePassword(
      data.password,
      user.passwordHash,
    );
    if (!passwordMatch) return null;

    user.status = 'online';
    user.updatedAt = nowDate();
    await user.save();

    const tokens = generateTokenPair({
      userId: user._id.toString(),
      email: user.email,
    });

    await RefreshToken.create({
      token: tokens.refreshToken,
      userId: user._id,
      expiresAt: getRefreshTokenExpiry(),
    });

    return { user: docToPublicUser(user), tokens };
  },

  async register(
    data: RegisterRequest,
  ): Promise<RegisterResult | 'email_taken'> {
    const exists = await User.findOne({
      email: data.email.toLowerCase().trim(),
    });
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

    const tokens = generateTokenPair({
      userId: newUser._id.toString(),
      email: newUser.email,
    });

    await RefreshToken.create({
      token: tokens.refreshToken,
      userId: newUser._id,
      expiresAt: getRefreshTokenExpiry(),
    });

    return { user: docToPublicUser(newUser), tokens };
  },

  /**
   * BUG FIX 3: Atomic refresh token rotation using findOneAndDelete.
   *
   * Old code did findOne → verify → deleteOne in separate steps.
   * Two concurrent refresh requests with the same token would BOTH pass the
   * findOne check before either deleteOne ran, resulting in two new token pairs
   * being issued for the same refresh token (classic token replay attack window).
   *
   * findOneAndDelete is atomic at the DB level — only ONE request will find and
   * delete the document; the concurrent one gets null and returns early.
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens | null> {
    // Atomically find AND delete in one operation
    const stored = await RefreshToken.findOneAndDelete({ token: refreshToken });
    if (!stored) return null; // Already used or doesn't exist

    try {
      const payload = verifyRefreshToken(refreshToken);
      const user = await User.findById(payload.userId);
      if (!user) return null; // User deleted — don't re-create the token

      // Issue new token pair
      const tokens = generateTokenPair({
        userId: user._id.toString(),
        email: user.email,
      });

      await RefreshToken.create({
        token: tokens.refreshToken,
        userId: user._id,
        expiresAt: getRefreshTokenExpiry(),
      });

      return tokens;
    } catch {
      // JWT verification failed (tampered/expired token) — stored doc already deleted above
      return null;
    }
  },

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await RefreshToken.deleteOne({ token: refreshToken });
    }
    await User.findByIdAndUpdate(userId, {
      status: 'offline',
      updatedAt: nowDate(),
    });
  },

  async getMe(userId: string): Promise<PublicUser | null> {
    const user = await User.findById(userId);
    if (!user) return null;
    return docToPublicUser(user);
  },
};
