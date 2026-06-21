import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { TemplatesService } from './templates.service';

function buildTemplate(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    ownerId: 'owner1',
    fileKey: 'templates/abc/file.pdf',
    pageCount: 2,
    formFields: [] as Array<Record<string, unknown>>,
    fields: [],
    save: jest.fn().mockResolvedValue(undefined),
    markModified: jest.fn(),
    ...overrides,
  };
}

function buildService(template: unknown) {
  const templateModel = {
    findById: jest.fn().mockResolvedValue(template),
  };
  const documentModel = {};
  const storageService = {
    downloadObject: jest.fn().mockResolvedValue(Buffer.from('pdf bytes')),
    tryGetDownloadUrl: jest.fn().mockResolvedValue(null),
  };
  const aiService = {
    extractPdfText: jest.fn().mockResolvedValue('שם ספק: חברת דוגמה'),
    extractTemplateFieldsFromPdf: jest.fn().mockResolvedValue([
      { label: 'שם ספק', pageNumber: 1, x: 10, y: 10, width: 20, height: 6 },
    ]),
  };

  const service = new TemplatesService(
    templateModel as never,
    documentModel as never,
    storageService as never,
    aiService as never,
  );

  return { service, templateModel, storageService, aiService };
}

describe('TemplatesService.addFormField', () => {
  it('throws when the caller does not own the template', async () => {
    const template = buildTemplate({ ownerId: 'someone-else' });
    const { service } = buildService(template);

    await expect(
      service.addFormField(String(template._id), 'owner1', {
        label: 'Field',
        pageNumber: 1,
        x: 10,
        y: 10,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('adds a field and persists it', async () => {
    const template = buildTemplate();
    const { service } = buildService(template);

    const result = await service.addFormField(String(template._id), 'owner1', {
      label: 'Field one',
      pageNumber: 1,
      x: 10,
      y: 20,
    });

    expect(result.formFields).toHaveLength(1);
    expect(result.formFields[0]).toMatchObject({
      label: 'Field one',
      type: 'text',
      pageNumber: 1,
      x: 10,
      y: 20,
    });
    expect(template.markModified).toHaveBeenCalledWith('formFields');
    expect(template.save).toHaveBeenCalled();
  });
});

describe('TemplatesService.updateFormField', () => {
  it('throws NotFoundException for an unknown field id', async () => {
    const template = buildTemplate();
    const { service } = buildService(template);

    await expect(
      service.updateFormField(String(template._id), 'owner1', 'missing', {
        label: 'New label',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('patches an existing field', async () => {
    const template = buildTemplate({
      formFields: [
        { id: 'field_one', label: 'Field one', type: 'text', section: 'general', pageNumber: 1, x: 10, y: 20, width: 20, height: 6 },
      ],
    });
    const { service } = buildService(template);

    const result = await service.updateFormField(String(template._id), 'owner1', 'field_one', {
      label: 'Renamed',
      type: 'date',
    });

    expect(result.formFields[0]).toMatchObject({ id: 'field_one', label: 'Renamed', type: 'date' });
    expect(template.save).toHaveBeenCalled();
  });
});

describe('TemplatesService.deleteFormField', () => {
  it('removes the field', async () => {
    const template = buildTemplate({
      formFields: [
        { id: 'field_one', label: 'Field one', type: 'text', section: 'general', pageNumber: 1, x: 10, y: 20, width: 20, height: 6 },
      ],
    });
    const { service } = buildService(template);

    const result = await service.deleteFormField(String(template._id), 'owner1', 'field_one');

    expect(result.formFields).toHaveLength(0);
    expect(template.save).toHaveBeenCalled();
  });
});

describe('TemplatesService.extractFormFields', () => {
  it('throws when the template has no uploaded PDF', async () => {
    const template = buildTemplate({ fileKey: null });
    const { service } = buildService(template);

    await expect(
      service.extractFormFields(String(template._id), 'owner1'),
    ).rejects.toThrow('Template PDF not found');
  });

  it('extracts fields from the PDF and merges them with existing ones', async () => {
    const template = buildTemplate();
    const { service, storageService, aiService } = buildService(template);

    const result = await service.extractFormFields(String(template._id), 'owner1');

    expect(storageService.downloadObject).toHaveBeenCalledWith('templates/abc/file.pdf');
    expect(aiService.extractTemplateFieldsFromPdf).toHaveBeenCalledWith(
      Buffer.from('pdf bytes'),
      2,
      [],
      'saved_template',
    );
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]).toMatchObject({ label: 'שם ספק', pageNumber: 1 });
    expect(template.save).toHaveBeenCalled();
  });

  it('does not duplicate a field already present at the same placement', async () => {
    const template = buildTemplate({
      formFields: [
        { id: 'existing', label: 'שם ספק', type: 'text', section: 'page_1', pageNumber: 1, x: 10, y: 10, width: 20, height: 6 },
      ],
    });
    const { service } = buildService(template);

    const result = await service.extractFormFields(String(template._id), 'owner1');

    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].id).toBe('existing');
  });
});
