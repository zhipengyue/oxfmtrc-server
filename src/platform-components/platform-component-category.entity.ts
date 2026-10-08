import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
@Entity('platform_component_categories')
export class PlatformComponentCategory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 80, unique: true }) name: string;
  @Column({ type: 'int', default: 0 }) sortOrder: number;
  @Column({ type: 'tinyint', default: 0 }) isDefault: boolean;
  @CreateDateColumn({ type: 'datetime' }) createdAt: Date;
  @UpdateDateColumn({ type: 'datetime' }) updatedAt: Date;
}
