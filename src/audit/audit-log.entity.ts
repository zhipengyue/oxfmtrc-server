import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditResource } from './audit-resource.enum';
import { AuditType } from './audit-type.enum';

@Entity('audit_logs')
@Index('idx_audit_logs_tenant_created', ['tenantId', 'createdAt'])
@Index('idx_audit_logs_type_created', ['type', 'createdAt'])
@Index('idx_audit_logs_actor_created', ['actorPhone', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 64 })
  actorPhone: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  actorDisplayName: string | null;

  @Column({ type: 'enum', enum: AuditType })
  type: AuditType;

  @Column({ type: 'enum', enum: AuditResource })
  resource: AuditResource;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  targetId: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  targetName: string | null;

  @Column({ type: 'varchar', length: 500 })
  summary: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
