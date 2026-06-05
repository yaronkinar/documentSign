import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Document, DocumentSchema } from './document.schema';
import { Signature, SignatureSchema } from '../signatures/signature.schema';
import { Comment, CommentSchema } from '../comments/comment.schema';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { WorkflowModule } from '../workflow/workflow.module';
import { InvitesModule } from '../invites/invites.module';
import { TemplatesModule } from '../templates/templates.module';
import { AiModule } from '../ai/ai.module';
import { SignatureFieldsService } from './signature-fields.service';
import {
  SignerProfile,
  SignerProfileSchema,
} from '../signer-profiles/signer-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Document.name, schema: DocumentSchema },
      { name: Signature.name, schema: SignatureSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: SignerProfile.name, schema: SignerProfileSchema },
    ]),
    WorkflowModule,
    InvitesModule,
    TemplatesModule,
    AiModule,
  ],
  providers: [DocumentsService, SignatureFieldsService],
  controllers: [DocumentsController],
  exports: [DocumentsService, SignatureFieldsService, MongooseModule],
})
export class DocumentsModule {}
