import { IsIn } from 'class-validator';

export class PublishComponentDto {
  @IsIn(['official', 'tenant', 'marketplace'], {
    message: 'visibility 须为 official | tenant | marketplace',
  })
  visibility!: 'official' | 'tenant' | 'marketplace';
}
