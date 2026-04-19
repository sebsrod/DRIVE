import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Header,
  BorderStyle,
  convertInchesToTwip,
} from 'docx'
import { saveAs } from 'file-saver'
import type { Profile } from './api'
import { OFFICE_ADDRESS } from './officeInfo'

const FONT = 'Arial'
const FONT_SIZE = 24 // docx usa half-points: 24 = 12pt
const LINE_SPACING = 520 // 26pt × 20 twips/pt = 520

function isHeading(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > 120) return false
  if (
    /^(PUNTO|CLÁUSULA|CLAUSULA|ARTÍCULO|ARTICULO|CAPÍTULO|CAPITULO)\s/i.test(t)
  )
    return true
  if (/^[A-ZÁÉÍÓÚÑ\s]+:\s*$/.test(t) && t.length < 80) return true
  return false
}

function parseRuns(text: string, bold = false): TextRun[] {
  const runs: TextRun[] = []
  const re = /\*\*([^*]+)\*\*/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      runs.push(
        new TextRun({
          text: text.slice(lastIdx, m.index),
          font: FONT,
          size: FONT_SIZE,
          bold,
        }),
      )
    }
    runs.push(
      new TextRun({
        text: m[1],
        font: FONT,
        size: FONT_SIZE,
        bold: true,
      }),
    )
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < text.length) {
    runs.push(
      new TextRun({
        text: text.slice(lastIdx),
        font: FONT,
        size: FONT_SIZE,
        bold,
      }),
    )
  }
  if (runs.length === 0) {
    runs.push(
      new TextRun({
        text,
        font: FONT,
        size: FONT_SIZE,
        bold,
      }),
    )
  }
  return runs
}

function headerParagraph(text: string, bold = false): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: LINE_SPACING },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: FONT_SIZE,
        bold,
      }),
    ],
  })
}

export async function downloadAsDocx(
  text: string,
  author: Profile | null,
  filename: string,
): Promise<void> {
  // Construir encabezado del despacho
  const headerParagraphs: Paragraph[] = [
    headerParagraph(author?.full_name ?? 'Abogado', true),
  ]
  if (author?.ipsa_number) {
    headerParagraphs.push(
      headerParagraph(`Abogado · I.P.S.A. N° ${author.ipsa_number}`),
    )
  }
  headerParagraphs.push(headerParagraph(OFFICE_ADDRESS))
  if (author?.phone) {
    const contactLine = author.email
      ? `Teléfono: ${author.phone} · ${author.email}`
      : `Teléfono: ${author.phone}`
    headerParagraphs.push(headerParagraph(contactLine))
  }
  // Línea separadora
  headerParagraphs.push(
    new Paragraph({
      spacing: { after: 200 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      },
    }),
  )

  // Parsear el cuerpo del documento
  const blocks = text.split(/\n{2,}/).map((b) => b.split(/\n/))
  const bodyParagraphs: Paragraph[] = []

  for (const lines of blocks) {
    const full = lines.join(' ').trim()
    if (!full) continue

    if (lines.length === 1 && isHeading(lines[0])) {
      bodyParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { line: LINE_SPACING },
          children: parseRuns(lines[0].trim(), true),
        }),
      )
    } else {
      const runs: TextRun[] = []
      lines.forEach((l, j) => {
        if (j > 0) {
          runs.push(
            new TextRun({
              text: ' ',
              font: FONT,
              size: FONT_SIZE,
            }),
          )
        }
        runs.push(...parseRuns(l))
      })
      bodyParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { line: LINE_SPACING },
          children: runs,
        }),
      )
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertInchesToTwip(8.5),
              height: convertInchesToTwip(13),
            },
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        headers: {
          default: new Header({ children: headerParagraphs }),
        },
        children: bodyParagraphs,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const safeName = filename.replace(/[^\w\s.-]+/g, '_') || 'documento'
  saveAs(blob, safeName.endsWith('.docx') ? safeName : `${safeName}.docx`)
}
