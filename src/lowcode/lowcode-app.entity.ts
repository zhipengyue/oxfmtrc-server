import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { AppLayoutType } from './app-layout-type.enum';
import { CanvasLayoutMode } from './canvas-layout-mode.enum';

/** 低代码应用元数据 + 草稿 JSON（整块 AppFullConfig） */
@Entity('lowcode_apps')
@Unique(['ownerAccount', 'slug'])
export class LowcodeApp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 对外 API 使用的应用 ID（与前端 appId 一致） */
  @Column({ type: 'varchar', length: 64, unique: true })
  appId: string;

  /** 与 JWT 中 phone 对齐，用于列表过滤与权限 */
  @Column({ type: 'varchar', length: 64 })
  ownerAccount: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 200 })
  slug: string;

  @Column({ type: 'varchar', length: 36 })
  categoryId: string;

  @Column({ type: 'enum', enum: AppLayoutType })
  primaryLayout: AppLayoutType;

  /** Web 画布布局；mobile 应用固定为 relative */
  @Column({
    type: 'enum',
    enum: CanvasLayoutMode,
    default: CanvasLayoutMode.RELATIVE,
  })
  canvasLayoutMode: CanvasLayoutMode;

  /** 完整 AppFullConfig JSON */
  @Column({ type: 'json' })
  draftConfig: Record<string, unknown>;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
