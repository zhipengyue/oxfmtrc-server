import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('categories')
@Unique(['ownerAccount', 'name'])
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 与 JWT phone 一致，按用户隔离分类 */
  @Column({ type: 'varchar', length: 64 })
  ownerAccount: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
