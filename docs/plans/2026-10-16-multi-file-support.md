# Multi-file Support Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.
>
> 2026-10-16 修订：按用户确认采用兼容 Word 的本地编辑内核，Word 不转换成 PDF。本文同步当前实现；验收结果见 `docs/multi-file-acceptance.md`。

**Goal:** 在本地文件存储、无需登录的平台中支持 PDF、Word、PowerPoint 和图片，统一文件卡片、阅读/编辑、手写笔记及关系连线。

**Architecture:** 保留现有节点、文件 ID、连线和笔记锚点。Word 使用 SuperDoc 在浏览器内直接编辑和导出 DOCX；旧 DOC 通过本机 Word 转换为 DOCX 编辑稿，保留原件。PPT 通过本地转换生成连续 PDF 预览，图片使用独立预览器，PDF 延续现有墨迹流程。

**Tech Stack:** React、TypeScript、React Flow、Node.js、PDF.js、pdf-lib、perfect-freehand、SuperDoc、sharp、yauzl、cfb；旧 DOC/PPT 转换支持 Microsoft Office，亦支持已配置的 LibreOffice。

---

## 1. 文件能力

| 类型 | 格式 | 平台内 | 默认软件 | 笔记与卡片 |
| --- | --- | --- | --- | --- |
| PDF | `.pdf` | 全文连续阅读、直接保存 PDF 墨迹 | 打开当前带批注版本 | 复用已有笔记、分屏、卡片连线 |
| Word | `.doc`、`.docx` | 直接编辑正文与排版，自动/手动保存 DOCX | 打开当前 DOCX 编辑稿；旧 DOC 准备失败时仍可打开原件 | 新建/选择关联笔记、连接其他卡片 |
| PPT | `.ppt`、`.pptx` | 本地生成 PDF，全部幻灯片连续滚动，支持 PDF 墨迹 | 打开原始演示文稿 | 同上 |
| 图片 | `.jpg`、`.jpeg`、`.png` | 预览、适应窗口、100%、25%–800% 缩放、平移、显示名称、文字备注 | 本期保留下载原图 | 同上 |

所有类型都可混合批量导入、拖动卡片、设置字段显隐、缩放卡片、收藏和检索。Word 与图片复用右侧手写笔记、分屏比例与专注模式；PPT 复用现有 PDF 阅读器的分屏与专注模式。

### Word 必须保留的基础操作

- 正文输入、删除、复制粘贴、撤销与重做。
- 字体、字号、加粗、斜体、下划线、字色和高亮。
- 段落对齐、行距、缩进、项目符号和编号列表。
- 插入图片、链接、表格及基础表格操作。
- 查找与替换、页面缩放。
- DOCX 自动保存、手动保存、下载，以及在默认软件打开。

本地兼容内核为 SuperDoc，并非微软 Word 网页版。Word 的正文修改保存到真实 DOCX；右侧手写笔记独立保存，不把自由画布笔迹伪装成 Word 正文对象。旧 DOC 导入后编辑 DOCX 工作稿，保留导入的二进制 DOC 原件。

## 2. 数据兼容与存储

继续使用 `node.type === 'paper'` 和 `Workspace.version === 1`，增加可选 `asset`、`remark` 字段，将 `year` 改为可选。旧卡片缺少类型时按 PDF 读取，未设置年份的文件进入时间轴“未设置年份”组。保留已有 ID、位置、边和手写笔记锚点。

```text
data/
  workspace.json
  workspace.previous.json
  notes/<noteId>.json
  papers/<fileId>/
    metadata.json
    original.pdf                     # 旧 PDF 原件路径继续有效
    source/original.<ext>             # 新文件的导入原件
    thumbnail.webp                   # 图片缩略图
    previews/<sourceHash>/base.pdf    # PPT 基础预览
    previews/<sourceHash>/base.docx   # 旧 DOC 的可编辑基础稿
    revisions/<revision>/
      document.docx                  # Word 当前编辑稿
      document.pdf                   # PDF / PPT 当前批注稿
      annotations.json               # PDF / PPT 墨迹
    jobs/<jobId>/                    # 转换暂存
```

文件标题和备注位于工作区；重命名不改变原件名称、节点 ID、文件 ID 或笔记绑定。缩略图通过本地 URL 读取。Word 保存要求匹配修订号和文件哈希；冲突保留当前编辑内容并提示下载编辑稿，不覆盖新版本。

## 3. API

| 接口 | 职责 |
| --- | --- |
| `PUT /api/files/:id?name=...` | 按签名/容器识别文件；图片和 DOCX 直接就绪；旧 DOC/PPT 入本地队列 |
| `GET /api/files/:id/info` | 类型、大小、图片尺寸、预览状态、修订号与错误 |
| `GET/HEAD /api/files/:id/content` | 图片原图、Word DOCX 编辑稿、PDF/PPT 当前 PDF |
| `GET/HEAD /api/files/:id/original` | 导入原件，使用真实 MIME 与扩展名 |
| `GET/HEAD /api/files/:id/base` | PDF 原始页面或 PPT 基础 PDF，供笔迹叠加使用；Word 不使用此入口 |
| `GET/HEAD /api/files/:id/thumbnail` | 图片缩略图 |
| `PUT /api/files/:id/document` | 保存真实 DOCX，使用 `If-Match` 修订检查 |
| `POST /api/files/:id/open` | 唤起系统默认程序 |
| `POST /api/files/:id/preview` | 重试/更新旧 DOC 或 PPT 的本地转换 |
| `GET/PUT /api/files/:id/annotations` | PDF/PPT 墨迹修订；Word 和图片使用独立手写笔记 |
| `GET /api/health` | 存储目录、Word 编辑能力与本地转换能力 |

上传单文件上限 100 MB，图片上限 8000 万像素。校验 PNG/JPEG 解码、PDF 可解析性、OOXML 主部件和 OLE Word/PPT 流；限制 ZIP 容器条目与解压体积。保留本机访问限制、Range/HEAD、原子写入和历史工作区备份。

## 4. 实施任务与代码位置

### Task 1：统一文件能力

- Modify: `src/types.ts`、`src/model.ts`、`src/card-model.ts`、`src/App.tsx`。
- Create: `src/asset-model.ts`、`src/asset-model.test.ts`。
- 兼容旧 PDF、可选年份、混合文件排序、字段能力、文件名/备注搜索。
- 验证：`npx vitest run src/asset-model.test.ts src/model.test.ts src/card-model.test.ts`。

### Task 2：通用本地文件层

- Modify: `server/index.mjs`、`server/storage.mjs`、`src/backend.ts`。
- Create: `server/file-types.mjs`、`server/images.mjs`、`server/assets.integration.mjs`。
- 分类型落盘、缩略图、原件保留、DOCX 修订保存与冲突保护。
- 验证：`node --test server/assets.integration.mjs server/backend.integration.mjs`。

### Task 3：本地 Office 兼容转换

- Create: `server/office-converter.mjs`、`server/convert-office.ps1`、`server/office.integration.mjs`。
- 旧 DOC 使用 Word 自带 `wordconv.exe` 转 DOCX，避免依赖 Word 交互界面；PPT 通过 PowerPoint 自动化导出 PDF。
- 可配置 `PAPERLY_SOFFICE_PATH` 使用 LibreOffice，Word 仍输出 DOCX，PPT 输出 PDF。
- 使用单任务队列、持久化状态、独立暂存目录、参数数组、超时、宏禁用和输出校验；重启恢复待转换任务。
- 验证：`node --test server/office.integration.mjs`，真实 DOC、PPTX、PPT 均通过；没有转换器的环境明确跳过并记录限制。

### Task 4：混合导入、卡片和资料库

- Create: `src/import-assets.ts`。
- Modify: `src/App.tsx`、`src/components/Nodes.tsx`、`CardAppearanceSettings.tsx`、`Inspector.tsx`、`Library.tsx`、`Dialogs.tsx`。
- 混合批量导入、类型标识、图片封面、字段设置、类型筛选、备注和原文件名检索。
- 人工验收大小写扩展名、中文名称、部分文件失败及重启后的卡片信息。

### Task 5：Word 直接编辑与共用笔记

- Create: `src/components/WordEditor.tsx`、`FileReader.tsx`、`AssetNotes.tsx`、`file-reader-types.ts`、`src/useAssetPreview.ts`、`src/asset-reader.css`。
- 使用 SuperDoc 浏览器编辑内核，显式关闭遥测；按基础操作清单裁剪工具栏。
- DOCX 自动保存与 Ctrl+S、保存失败保留编辑内容、关闭前处理未保存修改、下载编辑稿。
- 笔记继续绑定原卡片/文件，不为转换产物创建重复卡片。
- 浏览器验收实际输入 → 自动保存 → 关闭重开仍存在 → 右侧新建并关联手写笔记。

### Task 6：图片预览与备注

- Create: `src/components/ImageReader.tsx`、`src/image-view.ts`、`src/image-view.test.ts`。
- 适应窗口、原始比例、缩放锚点、平移边界、PNG 透明底、EXIF 方向处理。
- 显示名称与备注自动保存，复用手写笔记、分屏和专注模式。
- 验证：`npx vitest run src/image-view.test.ts`，浏览器修改名称/备注并重开确认。

### Task 7：跨类型关系与回归

- 保持 `src/ink-model.ts` 中现有节点锚点和文件 ID 规则；所有文件复用相同节点类型与关系连线。
- 验证卡片悬停查看笔记、笔记反向定位、删除/恢复锚点、时间轴往返与本地重启。
- 执行 `npm test`、`npm run build`；记录真实 Office 转换结果，不用模拟转换替代验收。

### Task 8：说明与验收记录

- Update: `README.md`、本计划。
- Create: `docs/multi-file-acceptance.md`、`THIRD_PARTY_NOTICES.md`。
- 说明旧 DOC 工作稿、Word 直接编辑、PPT 静态预览、图片备注、本地转换器和完整数据备份。

## 5. 交付边界

本期不增加登录、云转换、OCR、PPT 正文编辑、动画播放或图片像素编辑。Word 采用兼容内核，复杂版式可能与微软 Word 不同；保留原件和默认软件入口。PPT 原件保留，批注保存在其 PDF 预览；白板 JSON 导出不包含二进制文件，完整迁移需复制整个数据目录。

## 6. 官方依据

- [SuperDoc 本地加载与 DOCX 保存](https://docs.superdoc.dev/editor/load-and-save-documents/)
- [SuperDoc 编辑器配置](https://docs.superdoc.dev/editor/configuration/)
- [SuperDoc 关闭遥测](https://docs.superdoc.dev/editor/telemetry/)
- [LibreOffice 命令行转换](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)
- [LibreOffice 格式过滤器](https://help.libreoffice.org/latest/en-US/text/shared/guide/convertfilters.html)
