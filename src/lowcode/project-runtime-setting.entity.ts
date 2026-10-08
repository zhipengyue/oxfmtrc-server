import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** 非敏感的代理与鉴权规则；敏感值存放在 project_runtime_secrets。 */
@Entity('project_runtime_settings')
export class ProjectRuntimeSetting {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 64, unique: true }) appId: string;
  @Column({ type: 'varchar', length: 64 }) ownerAccount: string;
  @Column({ type: 'json' }) settings: Record<string, unknown>;
  @CreateDateColumn({ type: 'datetime' }) createdAt: Date;
  @UpdateDateColumn({ type: 'datetime' }) updatedAt: Date;
}
