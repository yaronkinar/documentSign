import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Comment, CommentSchema } from './comment.schema';
import { Document, DocumentSchema } from '../documents/document.schema';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      { name: Document.name, schema: DocumentSchema },
    ]),
    WorkflowModule,
  ],
  providers: [CommentsService],
  controllers: [CommentsController],
})
export class CommentsModule {}
