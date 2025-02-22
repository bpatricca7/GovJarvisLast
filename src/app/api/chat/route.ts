import { NextRequest, NextResponse } from 'next/server';
import { getChatResponse } from '../../../../backend/chat';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, planData, rfpText, history } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const response = await getChatResponse(message, planData, rfpText, history);
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error getting chat response:', error);
    return NextResponse.json(
      { error: error.message || 'Error getting chat response' },
      { status: 500 }
    );
  }
} 