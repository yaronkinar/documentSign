import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'signer_profiles', timestamps: true })
export class SignerProfile {
  @Prop({ required: true, index: true })
  ownerId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: String, default: null, lowercase: true, trim: true })
  email!: string | null;

  /** Internal storage key - NEVER returned to clients. */
  @Prop({ type: String, default: null })
  signatureImageKey!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type SignerProfileDocument = HydratedDocument<SignerProfile>;
export const SignerProfileSchema = SchemaFactory.createForClass(SignerProfile);

SignerProfileSchema.index({ ownerId: 1, title: 1, name: 1 });
