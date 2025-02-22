import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile } from '../../../../backend/fileProcessing';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    const multerFile = {
      buffer,
      mimetype: file.type,
      originalname: file.name,
      size: file.size,
    };

    const text = await extractTextFromFile(multerFile as any);
    return NextResponse.json({ text });
  } catch (error: any) {
    console.error('Error processing file:', error);
    return NextResponse.json(
      { error: error.message || 'Error processing file' },
      { status: 500 }
    );
  }
} 