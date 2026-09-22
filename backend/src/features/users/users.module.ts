import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module.js';
import { PasswordService } from './password.service.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [SessionsModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, PasswordService],
  exports: [UsersRepository, PasswordService],
})
export class UsersModule {}
