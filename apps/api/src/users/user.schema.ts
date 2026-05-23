import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { SignatureType, UserRole } from '@docflow/shared';

@Schema({ _id: true, timestamps: { createdAt: true, updatedAt: false } })
export class SavedSignature {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  label!: string;

  /** Internal storage key - NEVER returned to clients. Swap for signed URL. */
  @Prop({ required: true })
  imageKey!: string;

  @Prop({ required: true, enum: ['drawn', 'typed', 'uploaded'] })
  type!: SignatureType;

  @Prop({ default: false })
  isDefault!: boolean;

  @Prop({ default: () => new Date() })
  createdAt!: Date;
}

export const SavedSignatureSchema = SchemaFactory.createForClass(SavedSignature);

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true, unique: true, index: true })
  clerkId!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop()
  name?: string;

  @Prop()
  avatarUrl?: string;

  @Prop({ required: true, enum: ['admin', 'member', 'guest'], default: 'member' })
  role!: UserRole;

  @Prop({ type: [SavedSignatureSchema], default: [] })
  savedSignatures!: Types.DocumentArray<SavedSignature>;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
