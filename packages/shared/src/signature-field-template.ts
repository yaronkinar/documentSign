/** Field positions (% of page) on a generated form PDF. */
export interface SignatureFieldTemplate {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}
