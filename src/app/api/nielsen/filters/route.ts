import { NextRequest, NextResponse } from 'next/server';
import { getFilterOptionsFromSession, getSessionCategories, getSessionSourceFiles } from '@/lib/nielsen-processor';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const years = searchParams.get('years')?.split(',').map(Number).filter(n => !isNaN(n)) || [];
  const packageTypes = searchParams.get('packageTypes')?.split(',').filter(Boolean) || [];
  const markets = searchParams.get('markets') ? decodeURIComponent(searchParams.get('markets')!).split('|||') : [];
  const categories = searchParams.get('categories') ? decodeURIComponent(searchParams.get('categories')!).split('|||') : [];
  const sourceFiles = searchParams.get('sourceFiles') ? decodeURIComponent(searchParams.get('sourceFiles')!).split('|||') : [];
  
  const options = getFilterOptionsFromSession(
    years.length > 0 ? years : undefined,
    packageTypes.length > 0 ? packageTypes : undefined,
    markets.length > 0 ? markets : undefined,
    categories.length > 0 ? categories : undefined,
    sourceFiles.length > 0 ? sourceFiles : undefined
  );
  
  return NextResponse.json(options);
}
