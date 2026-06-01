import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { SignerProfileDto } from '@docflow/shared';

import { StorageService } from '../storage/storage.service';
import {
  CreateSignerProfileDto,
  UpdateSignerProfileDto,
} from './signer-profiles.dto';
import { SignerProfile, SignerProfileDocument } from './signer-profile.schema';

@Injectable()
export class SignerProfilesService {
  constructor(
    @InjectModel(SignerProfile.name)
    private readonly profileModel: Model<SignerProfileDocument>,
    private readonly storageService: StorageService,
  ) {}

  async list(ownerId: string): Promise<SignerProfileDto[]> {
    const profiles = await this.profileModel
      .find({ ownerId })
      .sort({ title: 1, name: 1 })
      .exec();
    return Promise.all(profiles.map((p) => this.toDto(p)));
  }

  async create(
    ownerId: string,
    dto: CreateSignerProfileDto,
  ): Promise<SignerProfileDto> {
    const profile = await this.profileModel.create({
      ownerId,
      title: dto.title.trim(),
      name: dto.name.trim(),
      email: dto.email?.toLowerCase().trim() ?? null,
      signatureImageKey: null,
    });
    return this.toDto(profile);
  }

  async update(
    ownerId: string,
    profileId: string,
    dto: UpdateSignerProfileDto,
  ): Promise<SignerProfileDto> {
    const profile = await this.findOwned(ownerId, profileId);
    if (dto.title !== undefined) profile.title = dto.title.trim();
    if (dto.name !== undefined) profile.name = dto.name.trim();
    if (dto.email !== undefined) {
      profile.email =
        dto.email === null || dto.email === ''
          ? null
          : dto.email.toLowerCase().trim();
    }
    await profile.save();
    return this.toDto(profile);
  }

  async remove(ownerId: string, profileId: string): Promise<void> {
    const profile = await this.findOwned(ownerId, profileId);
    const imageKey = profile.signatureImageKey;
    await profile.deleteOne();
    if (imageKey) {
      this.storageService.deleteObject(imageKey).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[signer-profiles] storage delete failed', err);
      });
    }
  }

  async getSignatureUploadUrl(
    ownerId: string,
    profileId: string,
  ): Promise<{ uploadUrl: string; imageKey: string }> {
    await this.findOwned(ownerId, profileId);
    const imageKey = `sigs/profiles/${profileId}.png`;
    const uploadUrl = await this.storageService.getUploadUrl(
      imageKey,
      'image/png',
    );
    return { uploadUrl, imageKey };
  }

  async confirmSignature(
    ownerId: string,
    profileId: string,
    imageKey: string,
  ): Promise<SignerProfileDto> {
    const profile = await this.findOwned(ownerId, profileId);
    const expectedKey = `sigs/profiles/${profileId}.png`;
    if (imageKey !== expectedKey) {
      throw new BadRequestException('Invalid imageKey');
    }
    const previousKey = profile.signatureImageKey;
    profile.signatureImageKey = imageKey;
    await profile.save();
    if (previousKey && previousKey !== imageKey) {
      this.storageService.deleteObject(previousKey).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[signer-profiles] storage delete failed', err);
      });
    }
    return this.toDto(profile);
  }

  async syncSignatureForEmail(
    ownerId: string,
    email: string,
    sourceImageKey: string,
  ): Promise<number> {
    const profiles = await this.profileModel
      .find({ ownerId, email: email.toLowerCase().trim() })
      .exec();
    if (profiles.length === 0) return 0;

    const image = await this.storageService.downloadObject(sourceImageKey);
    await Promise.all(
      profiles.map(async (profile) => {
        const targetImageKey = `sigs/profiles/${profile._id.toString()}.png`;
        const previousKey = profile.signatureImageKey;

        await this.storageService.uploadBuffer(targetImageKey, image, 'image/png');
        profile.signatureImageKey = targetImageKey;
        await profile.save();

        if (previousKey && previousKey !== targetImageKey) {
          this.storageService.deleteObject(previousKey).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[signer-profiles] storage delete failed', err);
          });
        }
      }),
    );

    return profiles.length;
  }

  async removeSignature(
    ownerId: string,
    profileId: string,
  ): Promise<SignerProfileDto> {
    const profile = await this.findOwned(ownerId, profileId);
    const previousKey = profile.signatureImageKey;
    profile.signatureImageKey = null;
    await profile.save();
    if (previousKey) {
      this.storageService.deleteObject(previousKey).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[signer-profiles] storage delete failed', err);
      });
    }
    return this.toDto(profile);
  }

  /** Returns the raw imageKey for a profile owned by `ownerId`, or null if missing/no signature. */
  async getImageKey(ownerId: string, profileId: string): Promise<string | null> {
    const profile = await this.profileModel.findOne({ _id: profileId, ownerId }).exec();
    return profile?.signatureImageKey ?? null;
  }

  /** Finds the first profile owned by `ownerId` whose email matches the signer and has a signature. */
  async findProfileForSigner(
    ownerId: string,
    email: string,
  ): Promise<{ _id: string; imageKey: string } | null> {
    const profile = await this.profileModel
      .findOne({
        ownerId,
        email: email.toLowerCase(),
        signatureImageKey: { $ne: null },
      })
      .exec();
    if (!profile || !profile.signatureImageKey) return null;
    return { _id: profile._id.toString(), imageKey: profile.signatureImageKey };
  }

  private async findOwned(
    ownerId: string,
    profileId: string,
  ): Promise<SignerProfileDocument> {
    const profile = await this.profileModel
      .findOne({ _id: profileId, ownerId })
      .exec();
    if (!profile) throw new NotFoundException('Signer profile not found');
    return profile;
  }

  private async toDto(profile: SignerProfileDocument): Promise<SignerProfileDto> {
    return {
      _id: profile._id.toString(),
      title: profile.title,
      name: profile.name,
      email: profile.email,
      signatureImageUrl: profile.signatureImageKey
        ? await this.storageService.getDownloadUrl(profile.signatureImageKey)
        : null,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
