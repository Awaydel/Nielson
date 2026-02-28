import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { 
  getTopBrandsFromSession, 
  getTopProductsFromSession, 
  getTopWeightsFromSession, 
  getTopVariantsFromSession,
  getYearComparisonFromSession
} from '@/lib/nielsen-processor';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse arrays from query params
    const marketsParam = searchParams.get('markets');
    const categoriesParam = searchParams.get('categories');
    const yearsParam = searchParams.get('years');
    const packageTypesParam = searchParams.get('packageTypes');
    
    const markets = marketsParam ? decodeURIComponent(marketsParam).split('|||').filter(Boolean) : [];
    const categories = categoriesParam ? decodeURIComponent(categoriesParam).split('|||').filter(Boolean) : [];
    const years = yearsParam ? yearsParam.split(',').map(Number).filter(n => !isNaN(n)) : [];
    const packageTypes = packageTypesParam ? packageTypesParam.split(',').filter(Boolean) : [];
    
    // Get data
    const [brands, products, weights, variants, comparison] = await Promise.all([
      Promise.resolve(getTopBrandsFromSession(markets, categories, years, packageTypes, [], 10)),
      Promise.resolve(getTopProductsFromSession(markets, categories, years, packageTypes, [], 10)),
      Promise.resolve(getTopWeightsFromSession(markets, categories, years, packageTypes, [], 5)),
      Promise.resolve(getTopVariantsFromSession(markets, categories, years, packageTypes, [], 10)),
      Promise.resolve(getYearComparisonFromSession(markets)),
    ]);
    
    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Helper to format numbers
    const formatRTO = (num: number) => Math.round(num * 1000);
    const formatQTY = (num: number) => Math.round(num * 1000);
    
    // Brands sheet
    const brandsData = [
      ['Топ 10 по Брендам', '', '', ''],
      ['#', 'Бренд', 'РТО, руб', 'Шт'],
      ...brands.map((b, i) => [i + 1, b.brand, formatRTO(b.rto), formatQTY(b.qty)])
    ];
    const brandsSheet = XLSX.utils.aoa_to_sheet(brandsData);
    XLSX.utils.book_append_sheet(workbook, brandsSheet, 'Топ бренды');
    
    // Products sheet
    const productsData = [
      ['Топ 10 по Продуктам', '', '', ''],
      ['#', 'Продукт', 'РТО, руб', 'Шт'],
      ...products.map((p, i) => [i + 1, p.product, formatRTO(p.rto), formatQTY(p.qty)])
    ];
    const productsSheet = XLSX.utils.aoa_to_sheet(productsData);
    XLSX.utils.book_append_sheet(workbook, productsSheet, 'Топ продукты');
    
    // Weights sheet
    const weightsData = [
      ['Топ 5 по Весу', '', '', ''],
      ['#', 'Вес (кг)', 'РТО, руб', 'Шт'],
      ...weights.map((w, i) => [i + 1, w.weight, formatRTO(w.rto), formatQTY(w.qty)])
    ];
    const weightsSheet = XLSX.utils.aoa_to_sheet(weightsData);
    XLSX.utils.book_append_sheet(workbook, weightsSheet, 'Топ вес');
    
    // Variants sheet
    const variantsData = [
      ['Топ 10 по Вкусу', '', '', ''],
      ['#', 'Вкус', 'РТО, руб', 'Шт'],
      ...variants.map((v, i) => [i + 1, v.variant, formatRTO(v.rto), formatQTY(v.qty)])
    ];
    const variantsSheet = XLSX.utils.aoa_to_sheet(variantsData);
    XLSX.utils.book_append_sheet(workbook, variantsSheet, 'Топ вкус');
    
    // Comparison sheet
    const comparisonData = [
      ['Сравнение по годам (2024 vs 2025)', '', '', '', '', '', '', ''],
      ['Данные', 'РТО 2024, руб', 'Шт 2024', 'РТО 2025, руб', 'Шт 2025', 'Дин. РТО, %', 'Дин. Продажи, %', 'Доля РТО, %'],
      ...comparison.map(c => [
        c.category,
        formatRTO(c.rto2024),
        formatQTY(c.qty2024),
        formatRTO(c.rto2025),
        formatQTY(c.qty2025),
        c.rtoDynamics,
        c.qtyDynamics,
        c.rtoShare
      ]),
      [
        'Итого',
        formatRTO(comparison.reduce((s, r) => s + r.rto2024, 0)),
        formatQTY(comparison.reduce((s, r) => s + r.qty2024, 0)),
        formatRTO(comparison.reduce((s, r) => s + r.rto2025, 0)),
        formatQTY(comparison.reduce((s, r) => s + r.qty2025, 0)),
        (() => {
          const t2024 = comparison.reduce((s, r) => s + r.rto2024, 0);
          const t2025 = comparison.reduce((s, r) => s + r.rto2025, 0);
          return t2024 > 0 ? Math.round(((t2025 - t2024) / t2024) * 10000) / 100 : 0;
        })(),
        (() => {
          const t2024 = comparison.reduce((s, r) => s + r.qty2024, 0);
          const t2025 = comparison.reduce((s, r) => s + r.qty2025, 0);
          return t2024 > 0 ? Math.round(((t2025 - t2024) / t2024) * 10000) / 100 : 0;
        })(),
        '100%'
      ]
    ];
    const comparisonSheet = XLSX.utils.aoa_to_sheet(comparisonData);
    XLSX.utils.book_append_sheet(workbook, comparisonSheet, 'Сравнение');
    
    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Generate filename with date
    const date = new Date().toISOString().split('T')[0];
    const filename = `nielsen_export_${date}.xlsx`;
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
