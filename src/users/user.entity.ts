import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserType } from './user-type.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: UserType })
  userType: UserType;

  /** 登录账号：个人为手机号；企业为管理员手机号 */
  @Column({ type: 'varchar', length: 20, unique: true })
  phone: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  /** 企业名称，仅 enterprise 有值 */
  @Column({ type: 'varchar', length: 200, nullable: true })
  companyName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
