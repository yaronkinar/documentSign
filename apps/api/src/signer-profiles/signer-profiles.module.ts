import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { StorageModule } from '../storage/storage.module';
import { SignerProfile, SignerProfileSchema } from './signer-profile.schema';
import { SignerProfilesController } from './signer-profiles.controller';
import { SignerProfilesService } from './signer-profiles.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SignerProfile.name, schema: SignerProfileSchema },
    ]),
    StorageModule,
  ],
  providers: [SignerProfilesService],
  controllers: [SignerProfilesController],
  exports: [SignerProfilesService],
})
export class SignerProfilesModule {}
