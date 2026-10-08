import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { AppLayoutType } from './app-layout-type.enum';
import { CanvasLayoutMode } from './canvas-layout-mode.enum';
import { ProjectVisibility } from './project-visibility.enum';

/** 低代码应用元数据 + 草稿 JSON（整块 AppFullConfig） */
@Entity('lowcode_apps')
@Unique(['ownerAccount', 'slug'])
@Index('idx_lowcode_apps_owner_updated', ['ownerAccount', 'updatedAt'])
@Index('idx_lowcode_apps_visibility', ['visibility'])
export class LowcodeApp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 对外 API 使用的应用 ID（与前端 appId 一致） */
  @Column({ type: 'varchar', length: 64, unique: true })
  appId: string;

  /** 与 JWT 中 phone 对齐，用于列表过滤与权限 */
  @Column({ type: 'varchar', length: 64 })
  ownerAccount: string;

  /** 企业内可见性：private 默认；tenant_public 对本企业成员可见（默认可查看） */
  @Column({
    type: 'enum',
    enum: ProjectVisibility,
    default: ProjectVisibility.PRIVATE,
  })
  visibility: ProjectVisibility;

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

  /** 列表封面由编辑器保存时自动截图生成。 */
  @Column({ type: 'mediumtext', nullable: true })
  coverUrl: string | null;

  /** 完整 AppFullConfig JSON */
  @Column({ type: 'json' })
  draftConfig: Record<string, unknown>;

  /** 当前对外发布快照；未发布则为 null */
  @Column({ type: 'json', nullable: true })
  publishedConfig: Record<string, unknown> | null;

  /** 历史发布快照：version → AppFullConfig */
  @Column({ type: 'json', nullable: true })
  publishedHistory: Record<string, Record<string, unknown>> | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
