import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Signature, SignatureSchema } from './signature.schema';
import { Document, DocumentSchema } from '../documents/document.schema';
import { SignaturesService } from './signatures.service';
import { SignaturesController } from './signatures.controller';
import { WorkflowModule } from '../workflow/workflow.module';
import { UsersModule } from '../users/users.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Signature.name, schema: SignatureSchema },
      { name: Document.name, schema: DocumentSchema },
    ]),
    WorkflowModule,
    UsersModule,
    DocumentsModule,
  ],
  providers: [SignaturesService],
  controllers: [SignaturesController],
  exports: [SignaturesService],
})
export class SignaturesModule {}
