import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type PlatformComponentVisibility = 'official' | 'tenant' | 'marketplace';

@Entity('platform_components')
@Index(['ownerScope', 'updatedAt'])
@Index(['ownerUserId', 'status'])
@Index(['status', 'visibility', 'updatedAt'])
export class PlatformComponent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  ownerScope: string;

  /** 私有库归属用户；发布后仍保留以便下架回流与「使用」鉴权 */
  @Column({ type: 'varchar', length: 36, nullable: true })
  ownerUserId: string | null;

  @Column({ type: 'varchar', length: 10 })
  platform: 'web' | 'mobile';

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 300, default: '' })
  description: string;

  @Column({ type: 'json' })
  tags: string[];

  @Column({ type: 'mediumtext' })
  template: string;

  @Column({ type: 'mediumtext' })
  script: string;

  @Column({ type: 'mediumtext' })
  style: string;

  @Column({ type: 'varchar', length: 20, default: 'unpublished' })
  status: 'published' | 'unpublished';

  /** 仅已发布有效；未发布为 null */
  @Column({ type: 'varchar', length: 20, nullable: true })
  visibility: PlatformComponentVisibility | null;

  @Column({ type: 'mediumtext', nullable: true })
  coverDataUrl: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  publisherDisplayName: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  publisherCompanyName: string | null;

  /** 从市场「使用」复制时记录来源 */
  @Column({ type: 'varchar', length: 36, nullable: true })
  sourceMarketplaceId: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
