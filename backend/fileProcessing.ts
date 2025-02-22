import mammoth from 'mammoth';
import PDF from 'pdf-parse';

export async function extractTextFromFile(file: Express.Multer.File): Promise<string> {
  try {
    console.log('Processing file:', {
      mimetype: file.mimetype,
      size: file.size,
      originalname: file.originalname
    });

    // Validate buffer exists and has content
    if (!file.buffer || file.buffer.length === 0) {
      throw new Error('Empty file buffer received');
    }

    if (file.mimetype === 'application/pdf') {
      try {
        // Use the PDF parser directly with the buffer
        const pdfData = await PDF(file.buffer);

        if (!pdfData || !pdfData.text) {
          throw new Error('Failed to extract text from PDF');
        }

        console.log('PDF parsed successfully, text length:', pdfData.text.length);
        return pdfData.text.trim();
      } catch (pdfError: any) {
        console.error('PDF parsing error:', {
          message: pdfError.message,
          stack: pdfError.stack
        });
        throw new Error(`PDF parsing failed: ${pdfError.message}`);
      }
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        console.log('Word document parsed successfully, text length:', result.value.length);
        if (result.messages.length > 0) {
          console.log('Mammoth messages:', result.messages);
        }
        return result.value.trim();
      } catch (docError: any) {
        console.error('Word document parsing error:', {
          message: docError.message,
          stack: docError.stack
        });
        throw new Error(`Word document parsing failed: ${docError.message}`);
      }
    }
    throw new Error('Unsupported file type');
  } catch (error: any) {
    console.error('Error extracting text from file:', {
      error: error.message,
      stack: error.stack,
      fileInfo: {
        mimetype: file.mimetype,
        size: file.size,
        originalname: file.originalname
      }
    });
    throw new Error(`Failed to process file: ${error.message}`);
  }
} 