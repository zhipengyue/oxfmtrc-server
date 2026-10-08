import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ProjectSharePermission } from './project-share-permission.enum';

@Entity('project_shares')
@Unique(['appId', 'memberPhone'])
@Index('idx_project_shares_member', ['memberPhone'])
@Index('idx_project_shares_app', ['appId'])
export class ProjectShare {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  appId: string;

  @Column({ type: 'varchar', length: 64 })
  memberPhone: string;

  @Column({ type: 'enum', enum: ProjectSharePermission })
  permission: ProjectSharePermission;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
