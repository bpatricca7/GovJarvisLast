import { PDFDocument } from 'pdf-lib';

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const pdfDoc = await PDFDocument.load(buffer);
    const pageCount = pdfDoc.getPageCount();
    let text = '';

    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i);
      text += await page.getText() + '\n';
    }

    return text.trim();
  } catch (error: any) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
} 