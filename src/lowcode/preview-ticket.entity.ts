import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('lowcode_preview_tickets')
export class PreviewTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'varchar', length: 64 })
  appId: string;

  @Column({ type: 'varchar', length: 64 })
  ownerAccount: string;

  @Column({ type: 'json' })
  snapshot: Record<string, unknown>;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
