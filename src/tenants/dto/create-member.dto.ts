import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateMemberDto {
  @IsString() @Matches(/^1[3-9]\d{9}$/, { message: '请输入有效的手机号' }) phone: string;
  @IsString() @Length(6, 64) password: string;
  @IsOptional() @IsString() @Length(1, 100) displayName?: string;
  @IsOptional() @IsString() avatarUrl?: string;
}
