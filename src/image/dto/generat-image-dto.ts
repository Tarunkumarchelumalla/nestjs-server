import {
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class GenerateImageDto {
  @IsString()
  prompt: string ; 

  @IsArray()
  imagesBase64: string[] ;

  @IsOptional()
  @IsString()
  size?: string;
}