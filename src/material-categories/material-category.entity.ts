import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** 素材库分类（对应 MinIO visual-assets 下目录） */
@Entity('material_categories')
@Unique(['ownerAccount', 'name'])
@Unique(['ownerAccount', 'slug'])
export class MaterialCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  ownerAccount: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** 目录名，用于 MinIO 路径 uploads/{owner}/{slug}/ */
  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
