export interface ExtractedTemplateField {
  label: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Value read at this field's location — from vision, later overridden with exact PDF text where available. */
  value?: string;
}
