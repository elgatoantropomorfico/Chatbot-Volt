import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { UserRole } from '@prisma/client';

interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
  tenantId?: string | null;
}

interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  static async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new Error('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name || null,
        passwordHash,
        role: input.role || 'agent',
        tenantId: input.tenantId || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        createdAt: true,
      },
    });

    return user;
  }

  static async validateCredentials(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
  }

  static async saveRefreshToken(userId: string, token: string, expiresAt: Date) {
    await prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });
  }

  static async findRefreshToken(token: string) {
    return prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  static async deleteRefreshToken(token: string) {
    await prisma.refreshToken.deleteMany({ where: { token } });
  }

  static async deleteAllUserRefreshTokens(userId: string) {
    await prisma.refreshToken.deleteMany({ where: { userId } });
  }
}
