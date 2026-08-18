import { IsEnum, IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { UserType } from '../../users/user-type.enum';

const CN_PHONE = /^1[3-9]\d{9}$/;

export class LoginDto {
  /** 与前端下拉一致：个人 / 企业 */
  @IsEnum(UserType, { message: '请选择账号类型：personal 或 enterprise' })
  accountType: UserType;

  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(CN_PHONE, { message: '请输入有效的手机号' })
  phone: string;

  @IsString()
  @Length(1, 64)
  password: string;
}
