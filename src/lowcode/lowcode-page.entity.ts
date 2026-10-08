import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('lowcode_pages')
export class LowcodePage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  appId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /** 页面布局 JSON（LayoutRoot：nodes、props 等） */
  @Column({ type: 'json' })
  detail: Record<string, unknown>;

  /** 乐观锁版本：每次成功保存 +1，用于多人同页冲突检测 */
  @Column({ type: 'int', default: 0 })
  revision: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
