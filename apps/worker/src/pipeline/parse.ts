import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import type { SupportedExt } from '@docmind/shared';

export interface ParsedSegment {
  /** 1-based page number. Non-paginated formats (docx/txt/md) use a single page: 1. */
  page: number;
  text: string;
}

export interface ParseResult {
  segments: ParsedSegment[];
  pageCount: number;
}

interface PdfPageData {
  getTextContent(): Promise<{ items: Array<{ str: string }> }>;
}

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  const pages: string[] = [];

  await pdfParse(buffer, {
    pagerender: async (pageData: PdfPageData) => {
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((item) => item.str).join(' ');
      pages.push(text);
      return text;
    },
  });

  return {
    segments: pages.map((text, i) => ({ page: i + 1, text })),
    pageCount: pages.length,
  };
}

async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  const { value: text } = await mammoth.extractRawText({ buffer });
  return { segments: [{ page: 1, text }], pageCount: 1 };
}

function parsePlainText(buffer: Buffer): ParseResult {
  const text = buffer.toString('utf-8');
  return { segments: [{ page: 1, text }], pageCount: 1 };
}

export async function parseDocument(buffer: Buffer, ext: SupportedExt): Promise<ParseResult> {
  switch (ext) {
    case 'pdf':
      return parsePdf(buffer);
    case 'docx':
      return parseDocx(buffer);
    case 'txt':
    case 'md':
      return parsePlainText(buffer);
    default: {
      const exhaustiveCheck: never = ext;
      throw new Error(`Unsupported extension: ${exhaustiveCheck}`);
    }
  }
}
