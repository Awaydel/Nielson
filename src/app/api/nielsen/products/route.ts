import { NextRequest, NextResponse } from 'next/server';
import { getTopProductsFromSession, DynamicFilter } from '@/lib/nielsen-processor';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const markets = searchParams.get('markets') ? decodeURIComponent(searchParams.get('markets')!).split('|||') : [];
  const categories = searchParams.get('categories') ? decodeURIComponent(searchParams.get('categories')!).split('|||') : [];
  const years = searchParams.get('years')?.split(',').map(Number).filter(n => !isNaN(n)) || [];
  const packageTypes = searchParams.get('packageTypes')?.split(',').filter(Boolean) || [];
  const sourceFiles = searchParams.get('sourceFiles') ? decodeURIComponent(searchParams.get('sourceFiles')!).split('|||') : [];
  
  // Support multiple dynamic filters
  const filters: DynamicFilter[] = [];
  for (let i = 1; i <= 3; i++) {
    const column = searchParams.get(`filter${i}Column`);
    const valuesParam = searchParams.get(`filter${i}Values`);
    if (column && valuesParam) {
      filters.push({
        column: decodeURIComponent(column),
        values: decodeURIComponent(valuesParam).split('|||').filter(Boolean)
      });
    }
  }
  
  // Also support legacy single filter for backwards compatibility
  const legacyColumn = searchParams.get('filterColumn');
  const legacyValue = searchParams.get('filterValue');
  if (legacyColumn && legacyValue && filters.length === 0) {
    filters.push({
      column: decodeURIComponent(legacyColumn),
      values: [decodeURIComponent(legacyValue)]
    });
  }
  
  const products = getTopProductsFromSession(markets, categories, years, packageTypes, sourceFiles, 10, filters);
  
  return NextResponse.json({ products });
}
