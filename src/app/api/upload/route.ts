import { NextRequest, NextResponse } from 'next/server';
import { loadFilesToSession, clearSessionData, getSessionCategories, appendFilesToSession } from '@/lib/nielsen-processor';

// Increase max duration for large file processing (5 minutes)
export const maxDuration = 300;

// Initial upload - clears existing data
export async function POST(request: NextRequest) {
  try {
    console.log('[Upload] Starting file upload...');
    
    // Check content length before processing
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const sizeMB = parseInt(contentLength) / (1024 * 1024);
      console.log(`[Upload] Request size: ${sizeMB.toFixed(2)} MB`);
      
      // Warn if very large
      if (sizeMB > 50) {
        console.log(`[Upload] Large upload detected, processing with care...`);
      }
    }
    
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    console.log(`[Upload] Received ${files.length} files`);
    
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }
    
    // Log file sizes
    let totalSize = 0;
    for (const file of files) {
      console.log(`[Upload] File: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      totalSize += file.size;
    }
    console.log(`[Upload] Total upload size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    
    // Clear previous session data
    clearSessionData();
    
    // Process files one by one to avoid memory issues
    const fileBuffers: { buffer: Buffer; fileName: string }[] = [];
    
    for (const file of files) {
      if (file instanceof File) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          fileBuffers.push({ buffer, fileName: file.name });
        } catch (fileError) {
          console.error(`[Upload] Error reading file ${file.name}:`, fileError);
          return NextResponse.json({ 
            error: `Ошибка чтения файла ${file.name}`,
            details: fileError instanceof Error ? fileError.message : 'Unknown error'
          }, { status: 400 });
        }
      }
    }
    
    console.log('[Upload] Loading files to session...');
    const result = loadFilesToSession(fileBuffers);
    console.log(`[Upload] Done! Total rows: ${result.totalRows}, categories: ${result.categories.length}`);
    
    return NextResponse.json({
      success: true,
      categories: result.categories.map(c => c.name),
      totalRows: result.totalRows,
      errors: result.errors,
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    
    // Return JSON error instead of HTML
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isMemoryError = errorMessage.includes('memory') || errorMessage.includes('heap') || errorMessage.includes('allocation');
    
    return NextResponse.json({ 
      error: isMemoryError ? 'Недостаточно памяти для обработки файлов. Попробуйте загрузить меньше файлов за раз.' : 'Failed to process files',
      details: errorMessage,
      isMemoryError
    }, { status: 500 });
  }
}

// Append files to existing data
export async function PUT(request: NextRequest) {
  try {
    console.log('[Upload/Append] Starting file append...');
    
    // Check content length
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const sizeMB = parseInt(contentLength) / (1024 * 1024);
      console.log(`[Upload/Append] Request size: ${sizeMB.toFixed(2)} MB`);
    }
    
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    console.log(`[Upload/Append] Received ${files.length} files to append`);
    
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }
    
    // Log file sizes
    for (const file of files) {
      console.log(`[Upload/Append] File: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    // Process files one by one to avoid memory issues
    const fileBuffers: { buffer: Buffer; fileName: string }[] = [];
    
    for (const file of files) {
      if (file instanceof File) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          fileBuffers.push({ buffer, fileName: file.name });
        } catch (fileError) {
          console.error(`[Upload/Append] Error reading file ${file.name}:`, fileError);
          return NextResponse.json({ 
            error: `Ошибка чтения файла ${file.name}`,
            details: fileError instanceof Error ? fileError.message : 'Unknown error'
          }, { status: 400 });
        }
      }
    }
    
    console.log('[Upload/Append] Appending files to session...');
    const result = appendFilesToSession(fileBuffers);
    console.log(`[Upload/Append] Done! Total rows: ${result.totalRows}, categories: ${result.categories.length}`);
    
    return NextResponse.json({
      success: true,
      categories: result.categories.map(c => c.name),
      totalRows: result.totalRows,
      addedRows: result.addedRows,
      errors: result.errors,
    });
  } catch (error) {
    console.error('[Upload/Append] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isMemoryError = errorMessage.includes('memory') || errorMessage.includes('heap') || errorMessage.includes('allocation');
    
    return NextResponse.json({ 
      error: isMemoryError ? 'Недостаточно памяти для обработки файлов. Попробуйте загрузить меньше файлов за раз.' : 'Failed to append files',
      details: errorMessage,
      isMemoryError
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const categories = getSessionCategories();
    return NextResponse.json({
      hasData: categories.length > 0,
      categories: categories.map(c => c.name),
    });
  } catch (error) {
    return NextResponse.json({
      hasData: false,
      categories: [],
    });
  }
}

export async function DELETE() {
  try {
    clearSessionData();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to clear data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
