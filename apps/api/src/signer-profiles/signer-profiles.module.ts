import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { StorageModule } from '../storage/storage.module';
import { PdfTemplate, PdfTemplateSchema } from '../templates/template.schema';
import { SignerProfile, SignerProfileSchema } from './signer-profile.schema';
import { SignerProfilesController } from './signer-profiles.controller';
import { SignerProfilesService } from './signer-profiles.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SignerProfile.name, schema: SignerProfileSchema },
      { name: PdfTemplate.name, schema: PdfTemplateSchema },
    ]),
    StorageModule,
  ],
  providers: [SignerProfilesService],
  controllers: [SignerProfilesController],
  exports: [SignerProfilesService],
})
export class SignerProfilesModule {}
