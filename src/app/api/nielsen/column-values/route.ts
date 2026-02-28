import { NextRequest, NextResponse } from 'next/server';
import { getAvailableColumns, getUniqueColumnValues } from '@/lib/nielsen-processor';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const column = searchParams.get('column');
    const categories = searchParams.get('categories') 
      ? decodeURIComponent(searchParams.get('categories')!).split('|||') 
      : [];
    
    // If no column specified, return list of available columns
    if (!column) {
      const columns = getAvailableColumns();
      return NextResponse.json({ columns });
    }
    
    // Return unique values for the specified column
    const values = getUniqueColumnValues(column, categories);
    return NextResponse.json({ column, values });
  } catch (error) {
    console.error('Error in column-values API:', error);
    return NextResponse.json({ columns: [], values: [] });
  }
}
