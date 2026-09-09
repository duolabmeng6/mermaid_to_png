import { describe, it, expect } from 'vitest'
import { getFlowchartEdgeLabel, updateFlowchartEdgeLabel } from './editFlowchartNode'
const edge = { fromNodeId: 'A', toNodeId: 'B' }
describe('连接线文字', () => {
  it.each(['-->|旧文字|', '-- 旧文字 -->', '-- old label -->', '-. old label .->', '== old label ==>'])('替换 %s 并保持节点声明', operator => {
    const source = `flowchart LR\n A[起点] ${operator} B[终点]`
    expect(getFlowchartEdgeLabel(source, edge)).not.toBeNull()
    expect(updateFlowchartEdgeLabel(source, edge, '新文字')).toContain('|"新文字"| B[终点]')
  })
  it('保持箭头类型与长度，不把链中另一段作为标签', () => {
    expect(updateFlowchartEdgeLabel('flowchart LR\n A -- text --> B', edge, '新')).toBe('flowchart LR\n A -->|"新"| B')
    expect(updateFlowchartEdgeLabel('flowchart LR\n A -. text .-> B', edge, '新')).toBe('flowchart LR\n A -.->|"新"| B')
    expect(updateFlowchartEdgeLabel('flowchart LR\n A -->|一| B -->|二| C', {...edge,toNodeId:'C'}, '新')).toBeNull()
  })
  it('添加、清空、平行边与链式边只修改目标', () => {
    const source = 'flowchart LR\r\n A -->|一| B --> C; A -->|二| B %% 保留\r\n'
    const updated = updateFlowchartEdgeLabel(source, {...edge, occurrence:1}, '')
    expect(updated).toBe('flowchart LR\r\n A -->|一| B --> C; A --> B %% 保留\r\n')
    expect(updateFlowchartEdgeLabel('flowchart LR\n A --> B',edge,'文字')).toContain('-->|"文字"|')
  })
  it('特殊字符和换行往返', () => {
    const label = '案例 / 交付 | "引号"\n<测试> & 内容'
    const updated = updateFlowchartEdgeLabel('flowchart LR\n A --> B', edge, label)!
    expect(getFlowchartEdgeLabel(updated,edge)).toBe(label)
  })
  it('忽略注释和节点标签内的伪连线', () => {
    const source = 'flowchart LR\n %% A -->|伪造| B\n X["A --> B"]\n A -->|真实| B'
    expect(getFlowchartEdgeLabel(source,edge)).toBe('真实')
    expect(updateFlowchartEdgeLabel(source,{...edge,occurrence:5},'失败')).toBeNull()
  })
})
