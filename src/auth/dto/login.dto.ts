import { Transform } from 'class-transformer';
import {
  Allow,
  IsEnum,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { UserType } from '../../users/user-type.enum';

const CN_PHONE = /^1[3-9]\d{9}$/;

function isEnterpriseLogin(accountType: unknown): boolean {
  return accountType === UserType.ENTERPRISE || accountType === 'enterprise';
}

export class LoginDto {
  /** 与前端下拉一致：个人 / 企业 */
  @IsEnum(UserType, { message: '请选择账号类型：personal 或 enterprise' })
  accountType: UserType;

  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @ValidateIf((o: LoginDto) => o.phone !== 'admin')
  @Matches(CN_PHONE, { message: '请输入有效的手机号' })
  phone: string;

  @IsString()
  @Length(1, 64)
  password: string;

  /**
   * 企业登录必填。不做 UUID 版本限制（TypeORM 可能生成 v1）。
   * @Allow 保证 whitelist 不会丢掉该字段。
   */
  @Allow()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((o: LoginDto) => isEnterpriseLogin(o.accountType))
  @IsString({ message: '请选择企业' })
  @IsNotEmpty({ message: '请选择企业' })
  tenantId?: string;
}
