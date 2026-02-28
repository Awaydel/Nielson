import { NextRequest, NextResponse } from 'next/server';
import { getYearComparisonFromSession } from '@/lib/nielsen-processor';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const markets = searchParams.get('markets') ? decodeURIComponent(searchParams.get('markets')!).split('|||') : [];
  
  const comparison = await getYearComparisonFromSession(markets);
  
  return NextResponse.json({ comparison });
}
