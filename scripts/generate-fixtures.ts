import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { createTextPdf } from '../src/core/pdf'
import { createPptx } from '../src/core/pptx'
import { createWorkbook, setCellValue, writeWorkbook } from '../src/core/sheet'
import { zipPack } from '../src/core/zip'
import { readFile } from 'node:fs/promises'

const execFileAsync = promisify(execFile)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const fixtures = path.join(root, 'fixtures')
const fontPath = path.join(root, 'assets', 'fonts', 'wqy-microhei.ttf')

await mkdir(fixtures, { recursive: true })

const welcome = `文枢示例文本

这是一个本地文件，用来演示多标签编辑。
修改这段文字后先不要保存，切换到其他标签再回来，内容应该还在。
关闭标签或退出文枢时，如果有未保存的修改，会先询问你。
`
await writeFile(path.join(fixtures, '欢迎使用.txt'), welcome, 'utf8')

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#f4efe6"/>
  <circle cx="160" cy="270" r="72" fill="#9c3b2e"/>
  <text x="250" y="250" font-size="64" fill="#1f1a17" font-family="Microsoft YaHei, WenQuanYi Micro Hei, sans-serif">文枢示例矢量图</text>
  <text x="250" y="320" font-size="28" fill="#6e645c" font-family="Microsoft YaHei, WenQuanYi Micro Hei, sans-serif">SVG 可以直接在图片标签里打开</text>
</svg>
`
await writeFile(path.join(fixtures, '示例矢量.svg'), svg, 'utf8')

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('文枢示例文档')] }),
      new Paragraph({ children: [new TextRun('这份文档可以用内置编辑器修改，也可以在连接 OnlyOffice 后按原版式编辑。')] }),
      new Paragraph({ children: [new TextRun('内置保存会保留标题和段落，但不会承诺与 Word 完全一致的分页。')] }),
      new Paragraph({ children: [new TextRun({ text: '加粗的一句。', bold: true }), new TextRun(' 后面是普通文字。')] }),
    ],
  }],
})
await writeFile(path.join(fixtures, '示例文档.docx'), await Packer.toBuffer(doc))

const book = createWorkbook()
const sheet = book.sheets[0]
sheet.name = '预算'
setCellValue(sheet, 0, 0, '项目')
setCellValue(sheet, 0, 1, '金额')
setCellValue(sheet, 0, 2, '备注')
setCellValue(sheet, 1, 0, '场地')
setCellValue(sheet, 1, 1, '12000')
setCellValue(sheet, 1, 2, '含周末')
setCellValue(sheet, 2, 0, '物料')
setCellValue(sheet, 2, 1, '3500')
setCellValue(sheet, 2, 2, '印刷和桌牌')
setCellValue(sheet, 3, 0, '合计')
setCellValue(sheet, 3, 1, '=SUM(B2:B3)')
setCellValue(sheet, 4, 0, '平均')
setCellValue(sheet, 4, 1, '=AVERAGE(B2:B3)')
const note = { name: '说明', cells: { '0,0': { v: '文枢示例表格，可直接修改数字。', t: 's' as const } }, rows: 20, cols: 8, merges: [], colWidths: [] }
book.sheets.push(note)
await writeFile(path.join(fixtures, '示例表格.xlsx'), writeWorkbook(book))

const pptx = await createPptx({
  title: '文枢示例演示',
  subtitle: '可以直接改这些文字',
  bullets: ['打开、编辑、另存为', '切换标签会保留未保存内容', '需要完整版式时连接 OnlyOffice'],
})
await writeFile(path.join(fixtures, '示例演示.pptx'), pptx)

const font = new Uint8Array(await readFile(fontPath))
await writeFile(path.join(fixtures, '示例.pdf'), await createTextPdf(['这是文枢生成的示例 PDF。', '可以预览、旋转、加字、拆分，也可以和其他 PDF 合并。'], font, '文枢示例'))
await writeFile(path.join(fixtures, '示例附页.pdf'), await createTextPdf(['这是用来演示合并的第二份 PDF。'], font, '附页'))

const packed = await zipPack([
  { name: '欢迎使用.txt', data: new TextEncoder().encode(welcome) },
  { name: '示例矢量.svg', data: new TextEncoder().encode(svg) },
])
await writeFile(path.join(fixtures, '示例压缩.zip'), packed)

await execFileAsync('ffmpeg', [
  '-y',
  '-f', 'lavfi',
  '-i', 'color=c=0x241f1c:s=960x540:d=3',
  '-vf', "drawtext=fontfile=/usr/share/fonts/truetype/wqy/wqy-microhei.ttc:text='文枢示例视频':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=(h-text_h)/2",
  '-pix_fmt', 'yuv420p',
  '-c:v', 'libx264',
  '-movflags', '+faststart',
  path.join(fixtures, '示例视频.mp4'),
])

await execFileAsync('ffmpeg', [
  '-y',
  '-f', 'lavfi',
  '-i', 'color=c=0xF4EFE6:s=1200x800',
  '-vf', "drawtext=fontfile=/usr/share/fonts/truetype/wqy/wqy-microhei.ttc:text='文枢示例图片':fontcolor=0x1F1A17:fontsize=72:x=80:y=340,drawtext=fontfile=/usr/share/fonts/truetype/wqy/wqy-microhei.ttc:text='PNG，可缩放查看，也可转成 PDF':fontcolor=0x6E645C:fontsize=32:x=80:y=440",
  '-frames:v', '1',
  path.join(fixtures, '示例图片.png'),
])

console.log('fixtures ready')
