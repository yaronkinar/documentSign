import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { SavedSignatureDto } from '@docflow/shared';

import { User, UserDocument } from './user.schema';
import { DocumentsService } from '../documents/documents.service';
import { StorageService } from '../storage/storage.service';
import { SignerProfilesService } from '../signer-profiles/signer-profiles.service';
import {
  ConfirmSavedSignatureDto,
  GetSignatureUploadUrlDto,
} from './users.dto';

const MAX_SAVED_SIGNATURES = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly documentsService: DocumentsService,
    private readonly storageService: StorageService,
    private readonly signerProfilesService: SignerProfilesService,
  ) {}

  async upsertFromClerk(data: {
    clerkId: string;
    email: string;
    name?: string;
    avatarUrl?: string;
  }): Promise<UserDocument> {
    const newEmail = data.email.toLowerCase();
    const existing = await this.userModel
      .findOne({ $or: [{ clerkId: data.clerkId }, { email: newEmail }] })
      .select('email clerkId')
      .lean()
      .exec();
    const previousEmail = existing?.email ?? null;
    const filter = existing ? { _id: existing._id } : { clerkId: data.clerkId };

    const user = await this.userModel
      .findOneAndUpdate(
        filter,
        {
          $set: {
            clerkId: data.clerkId,
            email: newEmail,
            name: data.name,
            avatarUrl: data.avatarUrl,
          },
          $setOnInsert: {
            role: 'member',
            savedSignatures: [],
            onboardingStatus: 'pending',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    if (previousEmail && previousEmail !== newEmail) {
      await this.documentsService.propagateParticipantEmailChange(
        data.clerkId,
        previousEmail,
        newEmail,
      );
    }

    return user;
  }

  async anonymizeByClerkId(clerkId: string): Promise<void> {
    await this.userModel
      .updateOne(
        { clerkId },
        {
          $set: {
            email: `deleted+${clerkId}@docflow.local`,
            name: null,
            avatarUrl: null,
          },
        },
      )
      .exec();
  }

  async findByClerkId(clerkId: string): Promise<UserDocument> {
    const user = await this.userModel.findOne({ clerkId }).exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findOrCreateFromAuth(data: {
    clerkId: string;
    email: string | null;
    name?: string | null;
  }): Promise<UserDocument> {
    const user = await this.userModel.findOne({ clerkId: data.clerkId }).exec();
    if (user) return user;
    if (!data.email) throw new NotFoundException('User not found');

    return this.upsertFromClerk({
      clerkId: data.clerkId,
      email: data.email,
      name: data.name ?? data.email,
    });
  }

  async findEmailByClerkId(clerkId: string): Promise<string | null> {
    const user = await this.userModel
      .findOne({ clerkId })
      .select('email')
      .lean()
      .exec();
    return user?.email ?? null;
  }

  async findClerkIdByEmail(email: string): Promise<string | null> {
    const user = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('clerkId')
      .lean()
      .exec();
    return user?.clerkId ?? null;
  }

  async searchUsers(
    query: string,
    limit = 10,
  ): Promise<Array<{ email: string; name?: string }>> {
    if (!query || query.trim().length < 2) return [];
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const users = await this.userModel
      .find({ $or: [{ email: regex }, { name: regex }] })
      .select('email name')
      .limit(limit)
      .lean()
      .exec();
    return users.map((u) => ({ email: u.email, name: u.name ?? undefined }));
  }

  async getSignatureUploadUrl(
    clerkId: string,
    _dto: GetSignatureUploadUrlDto,
  ): Promise<{ uploadUrl: string; imageKey: string }> {
    const user = await this.findByClerkId(clerkId);
    if (user.savedSignatures.length >= MAX_SAVED_SIGNATURES) {
      throw new BadRequestException(
        `Maximum of ${MAX_SAVED_SIGNATURES} saved signatures reached`,
      );
    }
    const sigId = new Types.ObjectId();
    const imageKey = `sigs/users/${user._id.toString()}/${sigId.toString()}.png`;
    const uploadUrl = await this.storageService.getUploadUrl(imageKey, 'image/png');
    return { uploadUrl, imageKey };
  }

  async confirmSavedSignature(
    clerkId: string,
    imageKey: string,
    dto: ConfirmSavedSignatureDto,
  ): Promise<UserDocument> {
    const user = await this.findByClerkId(clerkId);
    const expectedPrefix = `sigs/users/${user._id.toString()}/`;
    if (!imageKey.startsWith(expectedPrefix)) {
      throw new BadRequestException('Invalid imageKey');
    }
    if (user.savedSignatures.length >= MAX_SAVED_SIGNATURES) {
      throw new BadRequestException('Maximum saved signatures reached');
    }
    const isFirst = user.savedSignatures.length === 0;
    const shouldBeDefault = isFirst || dto.setDefault === true;
    if (shouldBeDefault) {
      user.savedSignatures.forEach((s) => {
        s.isDefault = false;
      });
    }
    user.savedSignatures.push({
      label: dto.label,
      imageKey,
      type: dto.type,
      isDefault: shouldBeDefault,
      createdAt: new Date(),
    } as never);
    await user.save();
    await this.signerProfilesService.syncSignatureForEmail(
      clerkId,
      user.email,
      imageKey,
    );
    return user;
  }

  async listSavedSignatures(clerkId: string): Promise<SavedSignatureDto[]> {
    const user = await this.userModel.findOne({ clerkId }).exec();
    if (!user) return [];
    const dtos = await Promise.all(
      user.savedSignatures.map(async (s) => {
        const imageUrl = await this.storageService.tryGetDownloadUrl(s.imageKey);
        if (!imageUrl) return null;
        return {
          _id: s._id.toString(),
          label: s.label,
          imageUrl,
          type: s.type,
          isDefault: s.isDefault,
          createdAt: s.createdAt.toISOString(),
        };
      }),
    );
    return dtos.filter((d): d is SavedSignatureDto => d !== null);
  }

  async setDefaultSignature(
    clerkId: string,
    signatureId: string,
  ): Promise<UserDocument> {
    const user = await this.findByClerkId(clerkId);
    const target = user.savedSignatures.id(signatureId);
    if (!target) throw new NotFoundException('Signature not found');
    user.savedSignatures.forEach((s) => {
      s.isDefault = s._id.equals(target._id);
    });
    await user.save();
    await this.signerProfilesService.syncSignatureForEmail(
      clerkId,
      user.email,
      target.imageKey,
    );
    return user;
  }

  async updateSignatureLabel(
    clerkId: string,
    signatureId: string,
    label: string,
  ): Promise<UserDocument> {
    const user = await this.findByClerkId(clerkId);
    const target = user.savedSignatures.id(signatureId);
    if (!target) throw new NotFoundException('Signature not found');
    target.label = label;
    await user.save();
    return user;
  }

  async deleteSavedSignature(
    clerkId: string,
    signatureId: string,
  ): Promise<void> {
    const user = await this.findByClerkId(clerkId);
    const target = user.savedSignatures.id(signatureId);
    if (!target) throw new NotFoundException('Signature not found');
    const wasDefault = target.isDefault;
    const removedKey = target.imageKey;
    target.deleteOne();
    if (wasDefault && user.savedSignatures.length > 0) {
      user.savedSignatures[0].isDefault = true;
    }
    await user.save();
    // Non-blocking delete from storage
    this.storageService.deleteObject(removedKey).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[users] storage delete failed', err);
    });
  }

  /**
   * Look up a saved signature by user + signatureId, returning its imageKey.
   * Used by SignaturesService when a registered user picks from library.
   */
  async getSavedSignatureKey(
    clerkId: string,
    signatureId: string,
  ): Promise<string | null> {
    const user = await this.findByClerkId(clerkId);
    const sig = user.savedSignatures.id(signatureId);
    return sig ? sig.imageKey : null;
  }

  async updateOnboardingStatus(
    clerkId: string,
    status: 'completed' | 'skipped',
  ): Promise<UserDocument> {
    const user = await this.findByClerkId(clerkId);
    user.onboardingStatus = status;
    await user.save();
    return user;
  }
}
