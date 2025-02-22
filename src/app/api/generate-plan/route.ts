import { NextRequest, NextResponse } from 'next/server';
import { generateStaffingPlan } from '../../../../backend/staffingPlan';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rfpText, approach, totalFTE } = body;

    if (!rfpText) {
      return NextResponse.json(
        { error: 'RFP text is required' },
        { status: 400 }
      );
    }

    const plan = await generateStaffingPlan(rfpText, approach, totalFTE);
    return NextResponse.json(plan);
  } catch (error: any) {
    console.error('Error generating staffing plan:', error);
    return NextResponse.json(
      { error: error.message || 'Error generating staffing plan' },
      { status: 500 }
    );
  }
} 