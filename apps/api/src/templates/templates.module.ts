import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PdfTemplate, PdfTemplateSchema } from './template.schema';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { AiModule } from '../ai/ai.module';
import {
  SignerProfile,
  SignerProfileSchema,
} from '../signer-profiles/signer-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PdfTemplate.name, schema: PdfTemplateSchema },
      { name: SignerProfile.name, schema: SignerProfileSchema },
    ]),
    AiModule,
  ],
  providers: [TemplatesService],
  controllers: [TemplatesController],
  exports: [TemplatesService],
})
export class TemplatesModule {}
