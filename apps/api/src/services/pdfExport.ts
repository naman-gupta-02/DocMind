import PDFDocument from 'pdfkit';
import type { Response } from 'express';

export interface ExportableCitation {
  filename: string;
  page: number;
  snippet: string;
}

export interface ExportableMessage {
  role: 'user' | 'assistant';
  content: string;
  citations: ExportableCitation[];
  createdAt: Date;
}

export interface ChatPdfOptions {
  title: string;
  scopeLabel: string;
  messages: ExportableMessage[];
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-z0-9-_ ]/gi, '').trim().slice(0, 60);
  return cleaned.length > 0 ? cleaned : 'chat';
}

/** Streams a formatted PDF transcript of a chat thread directly to an HTTP response. */
export function streamChatPdf(res: Response, options: ChatPdfOptions): void {
  const { title, scopeLabel, messages } = options;
  const doc = new PDFDocument({ margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(title)}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).fillColor('#111111').text('DocMind — Chat Export');
  doc.moveDown(0.4);
  doc.fontSize(11).fillColor('#555555');
  doc.text(`Thread: ${title}`);
  doc.text(`Documents: ${scopeLabel}`);
  doc.text(`Generated: ${new Date().toLocaleString()}`);
  doc.moveDown(0.6);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor('#dddddd')
    .stroke();
  doc.moveDown(0.8);

  for (const message of messages) {
    const label = message.role === 'user' ? 'You' : 'DocMind';
    const labelColor = message.role === 'user' ? '#7c3aed' : '#0e7490';

    doc.fontSize(10).fillColor(labelColor).text(`${label}  ·  ${message.createdAt.toLocaleString()}`);
    doc.fontSize(11).fillColor('#111111').text(message.content, { lineGap: 2 });

    if (message.citations.length > 0) {
      doc.moveDown(0.2);
      doc.fontSize(9).fillColor('#555555').text('Sources:');
      message.citations.forEach((citation, i) => {
        doc
          .fontSize(9)
          .fillColor('#555555')
          .text(`[${i + 1}] ${citation.filename}, p.${citation.page} — "${citation.snippet}"`, {
            indent: 12,
            lineGap: 1,
          });
      });
    }

    doc.moveDown(0.8);
  }

  doc.end();
}
