import { Injectable } from '@nestjs/common';
import type { Role } from '@gen-ui/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Db } from '../prisma/transaction.js';
import { publicUserSelect, type UserRecord } from './user.mapper.js';

export interface UserListFilter {
  page: number;
  pageSize: number;
  search?: string;
  role?: Role;
  isActive?: boolean;
}

/** All user queries live here so every read goes through `publicUserSelect`. */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  }

  /** The only query that loads the password hash — used by login. */
  findByEmailForLogin(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { ...publicUserSelect, passwordHash: true },
    });
  }

  async list(filter: UserListFilter): Promise<{ items: UserRecord[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      ...(filter.role && { role: filter.role }),
      ...(filter.isActive !== undefined && { isActive: filter.isActive }),
      ...(filter.search && {
        OR: [
          { email: { contains: filter.search, mode: 'insensitive' } },
          { name: { contains: filter.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: publicUserSelect,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  create(data: { email: string; name: string; passwordHash: string; role: Role }): Promise<UserRecord> {
    return this.prisma.user.create({
      data: { ...data, email: data.email.toLowerCase() },
      select: publicUserSelect,
    });
  }

  update(
    id: string,
    data: Pick<Prisma.UserUpdateInput, 'name' | 'role' | 'isActive' | 'lastLoginAt'>,
    db: Db = this.prisma,
  ): Promise<UserRecord> {
    return db.user.update({ where: { id }, data, select: publicUserSelect });
  }

  countActiveAdmins(excludeId?: string): Promise<number> {
    return this.prisma.user.count({
      where: { role: 'ADMIN', isActive: true, ...(excludeId && { id: { not: excludeId } }) },
    });
  }
}
