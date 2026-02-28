import { NextRequest, NextResponse } from 'next/server';
import { getFilteredDataFromSession, getSessionRawData } from '@/lib/nielsen-processor';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const markets = searchParams.get('markets') ? decodeURIComponent(searchParams.get('markets')!).split('|||') : [];
    const categories = searchParams.get('categories') ? decodeURIComponent(searchParams.get('categories')!).split('|||') : [];
    const years = searchParams.get('years')?.split(',').map(Number).filter(n => !isNaN(n)) || [];
    const packageTypes = searchParams.get('packageTypes')?.split(',').filter(Boolean) || [];
    const sourceFiles = searchParams.get('sourceFiles') ? decodeURIComponent(searchParams.get('sourceFiles')!).split('|||') : [];
    
    // Support multiple dynamic filters (filter1, filter2, filter3)
    const filters: { column: string; values: string[] }[] = [];
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
    
    let data = getFilteredDataFromSession(markets, categories, years, packageTypes, sourceFiles);
    
    // Apply all dynamic column filters
    if (filters.length > 0) {
      const rawData = getSessionRawData();
      
      // For each filter, build a set of valid keys
      for (const filter of filters) {
        const validKeys = new Set<string>();
        rawData.forEach((rawRow: Record<string, unknown>) => {
          const colValue = rawRow[filter.column];
          if (colValue !== undefined && filter.values.includes(String(colValue))) {
            const key = `${rawRow.MARKET}|${rawRow.PRODUCT}|${rawRow.BRAND}|${rawRow.YEAR}`;
            validKeys.add(key);
          }
        });
        data = data.filter((row) => {
          const key = `${row.MARKET}|${row.PRODUCT}|${row.BRAND}|${row.YEAR}`;
          return validKeys.has(key);
        });
      }
    }
    
    // Calculate totals by year
    let rto2024 = 0, qty2024 = 0, rto2025 = 0, qty2025 = 0;
    
    data.forEach(row => {
      if (row.YEAR === 2024) {
        rto2024 += row.RTO;
        qty2024 += row.QTY;
      } else if (row.YEAR === 2025) {
        rto2025 += row.RTO;
        qty2025 += row.QTY;
      }
    });
    
    const rtoDynamics = rto2024 > 0 ? Math.round(((rto2025 - rto2024) / rto2024) * 10000) / 100 : 0;
    const qtyDynamics = qty2024 > 0 ? Math.round(((qty2025 - qty2024) / qty2024) * 10000) / 100 : 0;
    
    return NextResponse.json({
      rto2024: Math.round(rto2024 * 100) / 100,
      qty2024: Math.round(qty2024 * 100) / 100,
      rto2025: Math.round(rto2025 * 100) / 100,
      qty2025: Math.round(qty2025 * 100) / 100,
      rtoDynamics,
      qtyDynamics,
      rowCount: data.length
    });
  } catch (error) {
    console.error('Comparison slice error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
