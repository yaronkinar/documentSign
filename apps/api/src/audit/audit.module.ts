import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuditEvent, AuditEventSchema } from './audit-event.schema';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { Document, DocumentSchema } from '../documents/document.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditEvent.name, schema: AuditEventSchema },
      { name: Document.name, schema: DocumentSchema },
    ]),
  ],
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
