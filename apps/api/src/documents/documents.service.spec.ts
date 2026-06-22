import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  AuditEventType,
  HAKNASOT_FORM_TEMPLATE_ID,
  getHaknasotFormFields,
} from '@docflow/shared';

import { DocumentsService } from './documents.service';

function buildDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    ownerId: 'owner1',
    fileKey: 'docs/abc/file.pdf',
    sourceContractKey: null as string | null,
    pageCount: 2,
    formFields: [
      { id: 'supplier_name', label: 'שם ספק', type: 'text', section: 'details', pageNumber: 1, x: 0, y: 0, width: 1, height: 1 },
    ],
    formValues: {},
    title: 'Test doc',
    status: 'draft',
    currentStep: 0,
    workflowSteps: [],
    participantEmails: ['owner1@example.com'],
    participantClerkIds: ['owner1'],
    createdAt: new Date(),
    updatedAt: new Date(),
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
    getUploadUrl: jest.fn().mockResolvedValue('https://upload.example/signed-url'),
    objectExists: jest.fn().mockResolvedValue(true),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  const aiService = {
    extractPdfText: jest.fn().mockResolvedValue('contract text mentioning חברת דוגמה'),
    extractFormFieldValues: jest
      .fn()
      .mockResolvedValue({ supplier_name: 'חברת דוגמה בע"מ' }),
    summarizeDocumentText: jest.fn().mockResolvedValue('a short summary'),
  };
  const auditService = { log: jest.fn() };

  const service = new DocumentsService(
    documentModel as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    storageService as never,
    auditService as never,
    aiService as never,
    {} as never,
    {} as never,
  );

  return { service, documentModel, storageService, aiService, auditService };
}

describe('DocumentsService.summarizeDocument', () => {
  it('reads text from sourceContractKey when present, even if fileKey is also set', async () => {
    const doc = buildDoc({
      description: null,
      fileKey: 'docs/abc/original.pdf',
      sourceContractKey: 'docs/abc/source-contract/c.pdf',
    });
    const { service, storageService } = buildService(doc);

    await service.summarizeDocument(doc._id.toString(), doc.ownerId);

    expect(storageService.downloadObject).toHaveBeenCalledWith('docs/abc/source-contract/c.pdf');
  });

  it('falls back to fileKey when sourceContractKey is absent', async () => {
    const doc = buildDoc({
      description: null,
      fileKey: 'docs/abc/original.pdf',
      sourceContractKey: null,
    });
    const { service, storageService } = buildService(doc);

    await service.summarizeDocument(doc._id.toString(), doc.ownerId);

    expect(storageService.downloadObject).toHaveBeenCalledWith('docs/abc/original.pdf');
  });
});

describe('DocumentsService.extractFormValues', () => {
  it('throws when the document has no uploaded PDF', async () => {
    const doc = buildDoc({ fileKey: null });
    const { service } = buildService(doc);

    await expect(
      service.extractFormValues(String(doc._id), 'owner1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('uses sourceContractKey as the text source when fileKey is null', async () => {
    const doc = buildDoc({
      fileKey: null,
      sourceContractKey: 'docs/abc/source-contract/c.pdf',
      formTemplateId: HAKNASOT_FORM_TEMPLATE_ID,
      formFields: [],
    });
    const { service, storageService, aiService } = buildService(doc);

    await service.extractFormValues(doc._id.toString(), doc.ownerId);

    expect(storageService.downloadObject).toHaveBeenCalledWith('docs/abc/source-contract/c.pdf');
    const [, fields] = aiService.extractFormFieldValues.mock.calls[0];
    expect(fields.length).toBe(getHaknasotFormFields().length);
  });

  it('throws when there is no fileKey and no sourceContractKey', async () => {
    const doc = buildDoc({ fileKey: null, sourceContractKey: null });
    const { service } = buildService(doc);

    await expect(
      service.extractFormValues(doc._id.toString(), doc.ownerId),
    ).rejects.toThrow('Document has no contract to extract values from');
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

describe('DocumentsService.createFromPdfTemplate', () => {
  it('copies the template formFields onto the new document', async () => {
    const documentModel = jest.fn().mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
      workflowSteps: [],
      save: jest.fn().mockResolvedValue(undefined),
    }));
    const storageService = {
      uploadBuffer: jest.fn().mockResolvedValue(undefined),
      getDownloadUrl: jest.fn().mockResolvedValue('https://example.com/doc.pdf'),
    };
    const auditService = { log: jest.fn() };
    const templatesService = {
      readTemplatePdf: jest.fn().mockResolvedValue({
        buffer: Buffer.from('pdf bytes'),
        fileSize: 100,
        pageCount: 2,
        name: 'My template',
        formFields: [
          { id: 'supplier_name', label: 'שם ספק', type: 'text', section: 'general', pageNumber: 1, x: 10, y: 10, width: 20, height: 6 },
        ],
      }),
    };

    const service = new DocumentsService(
      documentModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      storageService as never,
      auditService as never,
      {} as never,
      {} as never,
      templatesService as never,
    );

    const result = await service.createFromPdfTemplate('owner1', 'owner1@example.com', {
      title: 'New doc',
      pdfTemplateId: 'template-1',
    } as never);

    expect(result.formFields).toEqual([
      { id: 'supplier_name', label: 'שם ספק', type: 'text', section: 'general', pageNumber: 1, x: 10, y: 10, width: 20, height: 6 },
    ]);
  });
});

describe('DocumentsService.attachSourceContract', () => {
  it('generates a fileKey, persists it, and returns an upload URL', async () => {
    const doc = buildDoc({ sourceContractKey: null });
    const { service, storageService } = buildService(doc);

    const result = await service.attachSourceContract(doc._id.toString(), doc.ownerId);

    expect(doc.sourceContractKey).toMatch(
      new RegExp(`^docs/${doc._id.toString()}/source-contract/`),
    );
    expect(doc.save).toHaveBeenCalled();
    expect(storageService.getUploadUrl).toHaveBeenCalledWith(
      doc.sourceContractKey,
      'application/pdf',
    );
    expect(result).toEqual({
      uploadUrl: 'https://upload.example/signed-url',
      fileKey: doc.sourceContractKey,
    });
  });

  it('deletes the previous contract object from storage when re-attaching', async () => {
    const doc = buildDoc({ sourceContractKey: 'docs/abc/source-contract/old.pdf' });
    const { service, storageService } = buildService(doc);
    const previousKey = doc.sourceContractKey;

    await service.attachSourceContract(doc._id.toString(), doc.ownerId);

    expect(storageService.deleteObject).toHaveBeenCalledWith(previousKey);
  });

  it('does not call deleteObject when there is no previous contract', async () => {
    const doc = buildDoc({ sourceContractKey: null });
    const { service, storageService } = buildService(doc);

    await service.attachSourceContract(doc._id.toString(), doc.ownerId);

    expect(storageService.deleteObject).not.toHaveBeenCalled();
  });
});

describe('DocumentsService.confirmSourceContract', () => {
  it('throws when no contract attachment is pending', async () => {
    const doc = buildDoc({ sourceContractKey: null });
    const { service } = buildService(doc);

    await expect(
      service.confirmSourceContract(doc._id.toString(), doc.ownerId, 'owner@example.com'),
    ).rejects.toThrow('No source contract attachment pending');
  });

  it('throws when the uploaded object is missing from storage', async () => {
    const doc = buildDoc({ sourceContractKey: 'docs/abc/source-contract/c.pdf' });
    const { service, storageService } = buildService(doc);
    storageService.objectExists.mockResolvedValue(false);

    await expect(
      service.confirmSourceContract(doc._id.toString(), doc.ownerId, 'owner@example.com'),
    ).rejects.toThrow('Contract upload was not found in storage. Please upload the file again.');
  });

  it('logs an audit event and returns the document DTO when the object exists', async () => {
    const doc = buildDoc({ sourceContractKey: 'docs/abc/source-contract/c.pdf' });
    const { service, auditService } = buildService(doc);

    const result = await service.confirmSourceContract(
      doc._id.toString(),
      doc.ownerId,
      'owner@example.com',
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: doc._id,
        actorEmail: 'owner@example.com',
        eventType: AuditEventType.DocumentSourceContractAttached,
      }),
    );
    expect(result._id).toBe(doc._id.toString());
  });
});
