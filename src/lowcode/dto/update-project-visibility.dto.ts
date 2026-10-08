import { IsEnum } from 'class-validator';
import { ProjectVisibility } from '../project-visibility.enum';

export class UpdateProjectVisibilityDto {
  @IsEnum(ProjectVisibility, { message: 'visibility 须为 private 或 tenant_public' })
  visibility: ProjectVisibility;
}
