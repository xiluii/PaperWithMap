import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AiMarkdown from './components/AiMarkdown';

describe('AI answer rendering',()=>{
  it('renders CJK bold text next to punctuation without exposing Markdown markers',()=>{
    const html=renderToStaticMarkup(<AiMarkdown text={'**摘要——**这篇文章说明了研究问题。\n\n这也是**关键结论：**值得进一步验证。'}/>);
    expect(html).toContain('<strong>摘要——</strong>');expect(html).toContain('<strong>关键结论：</strong>');expect(html).not.toContain('**摘要');
  });
  it('preserves literal Markdown in escaped text and code',()=>{
    const html=renderToStaticMarkup(<AiMarkdown text={'\\*\\*字面标题——\\*\\*保持原样。\n\n`**代码标题——**`\n\n```md\n**代码标题——**中文\n```'}/>);
    expect(html).not.toContain('<strong>');expect(html).toContain('**字面标题——**');expect(html).toContain('**代码标题——**');
  });
  it('renders formulas and tables for both chat and saved notes',()=>{
    const html=renderToStaticMarkup(<AiMarkdown text={'$$E=mc^2$$\n\n|变量|含义|\n|---|---|\n|m|质量|'}/>);
    expect(html).toContain('katex');expect(html).toContain('<table>');expect(html).toContain('质量');
  });
  it('renders headings, lists, task lists, quotes and labelled copyable code blocks',()=>{
    const text='## 方法概览\n\n> 先理解假设\n\n1. 建模\n2. 验证\n\n- [x] 本地保存\n- [ ] 后续实验\n\n```js\nconst value = 42;\n```';
    const html=renderToStaticMarkup(<AiMarkdown text={text} interactive/>);
    expect(html).toContain('<h2>方法概览</h2>');expect(html).toContain('<blockquote>');expect(html).toContain('<ol>');expect(html).toContain('type="checkbox"');expect(html).toContain('language-js');expect(html).toContain('<span>js</span>');expect(html).toContain('aria-label="复制代码"');
    const saved=renderToStaticMarkup(<AiMarkdown text={text}/>);expect(saved).toContain('const value = 42;');expect(saved).not.toContain('<button');
  });
  it('contains wide tables in a keyboard-accessible horizontal scroll region',()=>{
    const html=renderToStaticMarkup(<AiMarkdown text={'| 方法 | 结果 |\n| --- | --- |\n| 本地实验 | 待验证 |'}/>);
    expect(html).toContain('aria-label="数据表格"');expect(html).toContain('tabindex="0"');expect(html).toContain('<table>');
  });
  it('keeps untrusted answers from executing HTML or loading remote tracking images',()=>{
    const html=renderToStaticMarkup(<AiMarkdown text={'<script>alert(1)</script>\n\n![tracking](https://untrusted.test/pixel?secret=paper)\n\n[link](javascript:alert%281%29)'}/>);
    expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).not.toContain('href="javascript:');expect(html).not.toContain('src="https://untrusted');
  });
});
