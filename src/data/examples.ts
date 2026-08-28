import type { DiagramExample } from '../types/diagram'

export const diagramExamples: DiagramExample[] = [
  {
    id: 'flowchart',
    name: '流程图',
    code: `flowchart TD
    A[收到需求] --> B{信息完整吗？}
    B -- 是 --> C[开始实现]
    B -- 否 --> D[补充需求]
    D --> B
    C --> E[检查结果]
    E --> F[完成交付]`,
  },
  {
    id: 'sequence',
    name: '时序图',
    code: `sequenceDiagram
    actor 用户
    participant 工具 as Mermaid 图像工坊
    用户->>工具: 粘贴 Mermaid 代码
    工具->>工具: 在浏览器本地渲染
    工具-->>用户: 显示实时预览
    用户->>工具: 导出高清 PNG 或 SVG
    工具-->>用户: 下载图片文件`,
  },
  {
    id: 'class',
    name: '类图',
    code: `classDiagram
    class DiagramEditor {
      +String code
      +render()
      +clear()
    }
    class ImageExporter {
      +exportSVG()
      +exportPNG(scale)
    }
    DiagramEditor --> ImageExporter : 提供 SVG`,
  },
  {
    id: 'gantt',
    name: '甘特图',
    code: `gantt
    title 本地工具开发计划
    dateFormat YYYY-MM-DD
    section 开发
    页面与编辑器 :done, ui, 2026-08-28, 1d
    Mermaid 渲染 :done, render, after ui, 1d
    高清图片导出 :active, export, after render, 1d
    section 验证
    构建与检查 :verify, after export, 1d`,
  },
]

export const defaultDiagramCode = diagramExamples[0].code
