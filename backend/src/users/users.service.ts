import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateUserDto,
  ListUsersQuery,
  Paginated,
  PublicUser,
  UpdateUserDto,
} from '@gen-ui/shared';
import { RefreshTokenService } from '../sessions/refresh-token.service.js';
import { PasswordService } from './password.service.js';
import { toPublicUser, type AuthUser } from './user.mapper.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async list(query: ListUsersQuery): Promise<Paginated<PublicUser>> {
    const { items, total } = await this.users.list(query);
    return { items: items.map(toPublicUser), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<PublicUser> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return toPublicUser(user);
  }

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.users.create({
      email: dto.email,
      name: dto.name,
      role: dto.role,
      passwordHash,
    });
    return toPublicUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser): Promise<PublicUser> {
    const target = await this.users.findById(id);
    if (!target) throw new NotFoundException('User not found');

    const roleChanged = dto.role !== undefined && dto.role !== target.role;
    const losesAdmin = target.role === 'ADMIN' && target.isActive && (dto.role === 'USER' || dto.isActive === false);
    const deactivating = dto.isActive === false && target.isActive;

    if (id === actor.id && losesAdmin) {
      throw new ForbiddenException('You cannot demote or deactivate your own account');
    }
    if (losesAdmin && (await this.users.countActiveAdmins(id)) === 0) {
      throw new ConflictException('At least one active admin is required');
    }

    const updated = await this.users.update(id, dto);

    if (deactivating) {
      await this.refreshTokens.revokeAllForUser(id, 'USER_DISABLED');
    } else if (roleChanged) {
      await this.refreshTokens.revokeAllForUser(id, 'ROLE_CHANGED');
    }
    return toPublicUser(updated);
  }
}
