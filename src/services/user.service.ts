import { User } from '../models/user.model.js';
import { docToPublicUser, nowDate } from '../helpers/index.js';
import { isUserOnline } from '../config/runtimeStore.js';
import type { PublicUser, UpdateProfileRequest, UserStatus } from '../types/index.js';

export const userService = {
  /**
   * Search users by name or email, excluding the requesting user.
   */
  async searchUsers(query: string, excludeUserId: string): Promise<PublicUser[]> {
    const q = query.trim();
    const users = await User.find({
      _id: { $ne: excludeUserId },
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ],
    }).limit(20);

    return users.map((u) => ({
      ...docToPublicUser(u),
      status: isUserOnline(u._id.toString()) ? 'online' : u.status,
    }));
  },

  /**
   * Get a single user by ID.
   */
  async getUserById(userId: string): Promise<PublicUser | null> {
    const user = await User.findById(userId);
    if (!user) return null;
    return {
      ...docToPublicUser(user),
      status: isUserOnline(userId) ? 'online' : user.status,
    };
  },

  /**
   * Update user profile fields.
   */
  async updateProfile(userId: string, updates: UpdateProfileRequest): Promise<PublicUser | null> {
    const patch: Partial<{ name: string; about: string; picture: string; updatedAt: Date }> = {
      updatedAt: nowDate(),
    };
    if (updates.name !== undefined) patch.name = updates.name.trim();
    if (updates.about !== undefined) patch.about = updates.about.trim();
    if (updates.picture !== undefined) patch.picture = updates.picture;

    const updated = await User.findByIdAndUpdate(userId, patch, { new: true });
    if (!updated) return null;
    return docToPublicUser(updated);
  },

  /**
   * Update user online status in DB.
   * The real-time "online" state is tracked in runtimeStore.
   */
  async updateStatus(userId: string, status: UserStatus): Promise<PublicUser | null> {
    const updated = await User.findByIdAndUpdate(
      userId,
      { status, updatedAt: nowDate() },
      { new: true },
    );
    if (!updated) return null;
    return docToPublicUser(updated);
  },

  /**
   * Verify a user exists (used in auth middleware).
   */
  async exists(userId: string): Promise<boolean> {
    const count = await User.countDocuments({ _id: userId });
    return count > 0;
  },
};
