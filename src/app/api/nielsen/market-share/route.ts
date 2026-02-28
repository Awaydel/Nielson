import { NextRequest, NextResponse } from 'next/server';
import { getSession, applyDynamicFilters } from '@/lib/nielsen-processor';

interface DynamicFilter {
  column: string;
  values: string[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const market1 = searchParams.get('market1') ? decodeURIComponent(searchParams.get('market1')!) : '';
    const market2 = searchParams.get('market2') ? decodeURIComponent(searchParams.get('market2')!) : '';
    const categories = searchParams.get('categories') ? decodeURIComponent(searchParams.get('categories')!).split('|||') : [];
    const packageTypes = searchParams.get('packageTypes')?.split(',').filter(Boolean) || [];
    const yearsParam = searchParams.get('years');
    const years = yearsParam ? yearsParam.split(',').map(Number).filter(y => !isNaN(y)) : [2025];
    const sourceFiles = searchParams.get('sourceFiles') ? decodeURIComponent(searchParams.get('sourceFiles')!).split('|||') : [];
    
    // Parse dynamic filters
    const filters: DynamicFilter[] = [];
    for (let i = 1; i <= 3; i++) {
      const column = searchParams.get(`filter${i}Column`);
      const values = searchParams.get(`filter${i}Values`);
      if (column && values) {
        filters.push({
          column: decodeURIComponent(column),
          values: decodeURIComponent(values).split('|||')
        });
      }
    }
    
    if (!market1 || !market2) {
      return NextResponse.json({
        brands: [],
        products: []
      });
    }
    
    // Get session data
    const session = getSession();
    if (!session.sessionData) {
      return NextResponse.json({ brands: [], products: [] });
    }
    
    // Helper function to get filtered data for a market
    const getMarketData = (market: string) => {
      let result: any[] = [];
      
      if (categories && categories.length > 0) {
        for (const cat of categories) {
          if (session.sessionData!.has(cat)) {
            result = result.concat(session.sessionData!.get(cat) || []);
          }
        }
      } else {
        session.sessionData!.forEach((rows) => { result = result.concat(rows); });
      }
      
      // Apply filters
      result = result.filter((row) => {
        if (market && row.MARKET !== market) return false;
        if (years.length > 0 && !years.includes(row.YEAR)) return false;
        if (packageTypes.length > 0 && !packageTypes.includes(row.PACKAGE_TYPE)) return false;
        if (sourceFiles.length > 0 && !sourceFiles.includes(row.SOURCE_FILE)) return false;
        return true;
      });
      
      // Apply dynamic filters
      result = applyDynamicFilters(result, filters);
      
      return result;
    };
    
    // Get data for both markets
    const market1Data = getMarketData(market1);
    const market2Data = getMarketData(market2);
    
    // Calculate total RTO for market 1
    const totalMarket1Rto = market1Data.reduce((sum, row) => sum + row.RTO, 0);
    const totalMarket2Rto = market2Data.reduce((sum, row) => sum + row.RTO, 0);
    
    // Calculate brand RTO for market 1 - this determines top 10
    const brandMarket1Map = new Map<string, number>();
    market1Data.forEach(row => {
      brandMarket1Map.set(row.BRAND, (brandMarket1Map.get(row.BRAND) || 0) + row.RTO);
    });
    
    // Calculate brand RTO for market 2
    const brandMarket2Map = new Map<string, number>();
    market2Data.forEach(row => {
      brandMarket2Map.set(row.BRAND, (brandMarket2Map.get(row.BRAND) || 0) + row.RTO);
    });
    
    // Get top 10 brands from market 1 (Рынок) sorted by RTO descending
    const topBrandsFromMarket1 = Array.from(brandMarket1Map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    // Calculate shares for these brands in both markets
    // Then sort by market1 share descending
    const brands = topBrandsFromMarket1
      .map(([brand, market1Rto]) => {
        const market2Rto = brandMarket2Map.get(brand) || 0;
        const market1Share = totalMarket1Rto > 0 ? (market1Rto / totalMarket1Rto) * 100 : 0;
        const market2Share = totalMarket2Rto > 0 ? (market2Rto / totalMarket2Rto) * 100 : 0;
        return {
          name: brand,
          market1: Math.round(market1Share * 100) / 100,
          market2: Math.round(market2Share * 100) / 100,
        };
      })
      .sort((a, b) => b.market1 - a.market1); // Sort by market1 share descending
    
    // Calculate product RTO for market 1 - this determines top 10
    const productMarket1Map = new Map<string, number>();
    market1Data.forEach(row => {
      productMarket1Map.set(row.PRODUCT, (productMarket1Map.get(row.PRODUCT) || 0) + row.RTO);
    });
    
    // Calculate product RTO for market 2
    const productMarket2Map = new Map<string, number>();
    market2Data.forEach(row => {
      productMarket2Map.set(row.PRODUCT, (productMarket2Map.get(row.PRODUCT) || 0) + row.RTO);
    });
    
    // Get top 10 products from market 1 (Рынок) sorted by RTO descending
    const topProductsFromMarket1 = Array.from(productMarket1Map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    // Calculate shares for these products in both markets
    // Then sort by market1 share descending
    const products = topProductsFromMarket1
      .map(([product, market1Rto]) => {
        const market2Rto = productMarket2Map.get(product) || 0;
        const market1Share = totalMarket1Rto > 0 ? (market1Rto / totalMarket1Rto) * 100 : 0;
        const market2Share = totalMarket2Rto > 0 ? (market2Rto / totalMarket2Rto) * 100 : 0;
        return {
          name: product.length > 50 ? product.substring(0, 50) + '...' : product,
          fullName: product,
          market1: Math.round(market1Share * 100) / 100,
          market2: Math.round(market2Share * 100) / 100,
        };
      })
      .sort((a, b) => b.market1 - a.market1); // Sort by market1 share descending
    
    return NextResponse.json({
      brands,
      products,
      market1Name: 'Рынок',
      market2Name: 'Победа',
      totalMarket1Rto,
      totalMarket2Rto,
    });
  } catch (error) {
    console.error('Error in market-share API:', error);
    return NextResponse.json({ brands: [], products: [] });
  }
}
