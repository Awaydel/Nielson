import { NextRequest, NextResponse } from 'next/server';
import { getCustomComparisonData, ComparisonItem } from '@/lib/nielsen-processor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { markets, comparisonItems } = body as {
      markets: string[];
      comparisonItems: ComparisonItem[];
    };
    
    if (!comparisonItems || comparisonItems.length === 0) {
      return NextResponse.json({ comparison: [] });
    }
    
    const comparison = getCustomComparisonData(markets || [], comparisonItems);
    
    return NextResponse.json({ comparison });
  } catch (error) {
    console.error('Custom comparison error:', error);
    return NextResponse.json({ error: 'Failed to get comparison data' }, { status: 500 });
  }
}
