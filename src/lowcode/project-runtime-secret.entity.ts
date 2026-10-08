import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity('project_runtime_secrets')
@Unique(['appId', 'name'])
export class ProjectRuntimeSecret {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 64 }) appId: string;
  @Column({ type: 'varchar', length: 64 }) ownerAccount: string;
  @Column({ type: 'varchar', length: 100 }) name: string;
  @Column({ type: 'varchar', length: 300, default: '' }) note: string;
  @Column({ type: 'text' }) encryptedValue: string;
  @Column({ type: 'varchar', length: 64 }) encryptionIv: string;
  @Column({ type: 'varchar', length: 64 }) encryptionTag: string;
  @CreateDateColumn({ type: 'datetime' }) createdAt: Date;
  @UpdateDateColumn({ type: 'datetime' }) updatedAt: Date;
}
