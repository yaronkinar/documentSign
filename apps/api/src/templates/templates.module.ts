import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PdfTemplate, PdfTemplateSchema } from './template.schema';
import { Document, DocumentSchema } from '../documents/document.schema';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PdfTemplate.name, schema: PdfTemplateSchema },
      { name: Document.name, schema: DocumentSchema },
    ]),
    AiModule,
  ],
  providers: [TemplatesService],
  controllers: [TemplatesController],
  exports: [TemplatesService],
})
export class TemplatesModule {}
