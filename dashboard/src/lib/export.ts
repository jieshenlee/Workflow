// Client-side export of a blog draft (markdown) to .md or .docx, and of a
// video-template checklist to .xlsx or .pptx. These libraries are heavy,
// so they're loaded on demand only when used.

import type { ChecklistItem } from './types'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'blog-post'
  )
}

export function exportMarkdown(md: string, baseName: string) {
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  downloadBlob(blob, `${baseName}.md`)
}

// Decode a base64 image into a real image file and download it (png/jpg/webp).
export function exportImageBase64(b64: string, mimeType: string, baseName: string) {
  const ext = /jpe?g/i.test(mimeType) ? 'jpg' : /webp/i.test(mimeType) ? 'webp' : 'png'
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: mimeType || 'image/png' })
  downloadBlob(blob, `${baseName}.${ext}`)
}

export async function exportDocx(md: string, title: string, baseName: string) {
  const docx = await import('docx')
  const { marked } = await import('marked')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink } = docx

  const headingFor = (depth: number) => {
    const levels = [
      HeadingLevel.HEADING_1,
      HeadingLevel.HEADING_2,
      HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4,
    ]
    return levels[Math.min(Math.max(depth, 1), 4) - 1]
  }

  // Map inline markdown tokens to docx runs.
  const inlineRuns = (tokens: any[]): any[] => {
    const runs: any[] = []
    for (const t of tokens || []) {
      switch (t.type) {
        case 'text':
          if (t.tokens && t.tokens.length) runs.push(...inlineRuns(t.tokens))
          else runs.push(new TextRun(t.text ?? ''))
          break
        case 'strong':
          runs.push(new TextRun({ text: t.text ?? '', bold: true }))
          break
        case 'em':
          runs.push(new TextRun({ text: t.text ?? '', italics: true }))
          break
        case 'codespan':
          runs.push(new TextRun({ text: t.text ?? '', font: 'Courier New' }))
          break
        case 'br':
          runs.push(new TextRun({ text: '', break: 1 }))
          break
        case 'link':
          runs.push(
            new ExternalHyperlink({
              link: t.href,
              children: [new TextRun({ text: t.text ?? t.href, style: 'Hyperlink' })],
            }),
          )
          break
        default:
          if (t.text) runs.push(new TextRun(t.text))
      }
    }
    return runs.length ? runs : [new TextRun('')]
  }

  const children: any[] = []
  const tokens = marked.lexer(md) as any[]

  for (const tok of tokens) {
    switch (tok.type) {
      case 'heading':
        children.push(
          new Paragraph({
            heading: headingFor(tok.depth),
            children: inlineRuns(tok.tokens),
            spacing: { before: 200, after: 80 },
          }),
        )
        break
      case 'paragraph':
        children.push(new Paragraph({ children: inlineRuns(tok.tokens), spacing: { after: 120 } }))
        break
      case 'list': {
        const start = typeof tok.start === 'number' ? tok.start : 1
        tok.items.forEach((item: any, idx: number) => {
          const runs: any[] = []
          for (const block of item.tokens || []) {
            if (block.type === 'text' || block.type === 'paragraph') {
              runs.push(...inlineRuns(block.tokens || [{ type: 'text', text: block.text }]))
            }
          }
          if (tok.ordered) {
            children.push(
              new Paragraph({
                children: [new TextRun(`${start + idx}. `), ...runs],
                indent: { left: 360 },
                spacing: { after: 60 },
              }),
            )
          } else {
            children.push(
              new Paragraph({ children: runs, bullet: { level: 0 }, spacing: { after: 60 } }),
            )
          }
        })
        break
      }
      case 'blockquote':
        for (const inner of tok.tokens || []) {
          if (inner.type === 'paragraph') {
            children.push(
              new Paragraph({
                children: inlineRuns(inner.tokens),
                indent: { left: 360 },
                spacing: { after: 120 },
              }),
            )
          }
        }
        break
      case 'code':
        children.push(
          new Paragraph({
            children: [new TextRun({ text: tok.text ?? '', font: 'Courier New' })],
            spacing: { after: 120 },
          }),
        )
        break
      case 'space':
      case 'hr':
        break
      default:
        if (tok.raw && tok.raw.trim()) {
          children.push(new Paragraph({ children: [new TextRun(tok.raw.trim())] }))
        }
    }
  }

  const doc = new Document({
    title,
    sections: [{ children }],
  })

  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `${baseName}.docx`)
}

function hexToArgb(hex: string): string {
  const clean = (hex || '4F46E5').replace('#', '').padEnd(6, '0').slice(0, 6)
  return `FF${clean.toUpperCase()}`
}

export async function exportChecklistExcel(
  items: ChecklistItem[],
  title: string,
  brandColorHex: string,
  baseName: string,
) {
  const mod: any = await import('exceljs')
  const ExcelJS = mod.default ?? mod
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet((title || 'Checklist').slice(0, 31))

  sheet.columns = [
    { header: '#', key: 'n', width: 5 },
    { header: 'Step', key: 'step', width: 34 },
    { header: 'Detail', key: 'detail', width: 60 },
    { header: 'Done', key: 'done', width: 8 },
  ]

  sheet.getRow(1).eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(brandColorHex) } }
  })

  items.forEach((item, i) => {
    sheet.addRow({ n: i + 1, step: item.step, detail: item.detail, done: '' })
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(blob, `${baseName}.xlsx`)
}

export async function exportChecklistPptx(
  items: ChecklistItem[],
  title: string,
  brandColorHex: string,
  baseName: string,
) {
  const mod: any = await import('pptxgenjs')
  const PptxGenJS = mod.default ?? mod
  const pptx = new PptxGenJS()
  const accent = (brandColorHex || '4F46E5').replace('#', '')

  const titleSlide = pptx.addSlide()
  titleSlide.background = { color: accent }
  titleSlide.addText(title || 'Checklist', {
    x: 0.5, y: 2.2, w: 9, h: 1.2,
    fontSize: 32, bold: true, color: 'FFFFFF', align: 'center',
  })

  items.forEach((item, i) => {
    const slide = pptx.addSlide()
    slide.addShape('rect', { x: 0, y: 0, w: 0.25, h: 5.63, fill: { color: accent } })
    slide.addText(`${i + 1}. ${item.step}`, {
      x: 0.6, y: 0.5, w: 9, h: 0.8, fontSize: 24, bold: true, color: '1A1A1A',
    })
    if (item.detail) {
      slide.addText(item.detail, { x: 0.6, y: 1.5, w: 9, h: 3.5, fontSize: 16, color: '404040', valign: 'top' })
    }
  })

  await pptx.writeFile({ fileName: `${baseName}.pptx` })
}
