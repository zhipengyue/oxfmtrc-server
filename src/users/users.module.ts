import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { LowcodeApp } from '../lowcode/lowcode-app.entity';
import { OwnerAccountMigrationService } from './owner-account-migration.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, LowcodeApp])],
  providers: [OwnerAccountMigrationService],
  exports: [TypeOrmModule],
})
export class UsersModule {}
