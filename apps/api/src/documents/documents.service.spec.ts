import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { DocumentsService } from './documents.service';

function buildDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    ownerId: 'owner1',
    fileKey: 'docs/abc/file.pdf',
    pageCount: 2,
    formFields: [
      { id: 'supplier_name', label: 'שם ספק', type: 'text', section: 'details', pageNumber: 1, x: 0, y: 0, width: 1, height: 1 },
    ],
    formValues: {},
    save: jest.fn().mockResolvedValue(undefined),
    markModified: jest.fn(),
    ...overrides,
  };
}

function buildService(doc: unknown) {
  const documentModel = {
    findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) }),
  };
  const storageService = {
    downloadObject: jest.fn().mockResolvedValue(Buffer.from('pdf bytes')),
  };
  const aiService = {
    extractPdfText: jest.fn().mockResolvedValue('contract text mentioning חברת דוגמה'),
    extractFormFieldValues: jest
      .fn()
      .mockResolvedValue({ supplier_name: 'חברת דוגמה בע"מ' }),
  };

  const service = new DocumentsService(
    documentModel as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    storageService as never,
    {} as never,
    aiService as never,
    {} as never,
    {} as never,
  );

  return { service, documentModel, storageService, aiService };
}

describe('DocumentsService.extractFormValues', () => {
  it('throws when the document has no uploaded PDF', async () => {
    const doc = buildDoc({ fileKey: null });
    const { service } = buildService(doc);

    await expect(
      service.extractFormValues(String(doc._id), 'owner1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('merges extracted values into doc.formValues and persists', async () => {
    const doc = buildDoc();
    const { service, storageService, aiService } = buildService(doc);

    const result = await service.extractFormValues(String(doc._id), 'owner1');

    expect(storageService.downloadObject).toHaveBeenCalledWith('docs/abc/file.pdf');
    expect(aiService.extractFormFieldValues).toHaveBeenCalledWith(
      'contract text mentioning חברת דוגמה',
      [{ id: 'supplier_name', label: 'שם ספק' }],
    );
    expect(result).toEqual({ values: { supplier_name: 'חברת דוגמה בע"מ' } });
    expect(doc.formValues).toEqual({ supplier_name: 'חברת דוגמה בע"מ' });
    expect(doc.markModified).toHaveBeenCalledWith('formValues');
    expect(doc.save).toHaveBeenCalled();
  });

  it('returns existing values unchanged when there are no form fields', async () => {
    const doc = buildDoc({ formFields: [] });
    const { service, aiService } = buildService(doc);

    const result = await service.extractFormValues(String(doc._id), 'owner1');

    expect(result).toEqual({ values: {} });
    expect(aiService.extractFormFieldValues).not.toHaveBeenCalled();
  });
});
