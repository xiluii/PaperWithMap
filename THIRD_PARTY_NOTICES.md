# Third-party notices

This repository uses the dependencies listed in `package.json` and `package-lock.json`. Their copyright and license notices are retained in their installed packages.

## Word document editor

- **SuperDoc 2.23.0** — Harbour Enterprises, Inc. / SuperDoc. The `superdoc` package declares AGPL-3.0. Source: <https://github.com/superdoc/docx-editor>. License: `node_modules/superdoc/LICENSE`.
- **SuperDoc DOCX Engine 0.22.0** — the separate `@superdoc/docx-engine` dependency uses its own proprietary license. The installed license describes evaluation, development and testing as authorized uses, and separately describes production/commercial use under an applicable agreement. See `node_modules/@superdoc/docx-engine/DOCX-ENGINE-LICENSE.md` and <https://docs.superdoc.dev/resources/docx-engine-license> for the full terms. The package's original notices are retained.

Paperly's integration handles document storage locally and explicitly disables SuperDoc telemetry. It does not require a SuperDoc account or upload the user's document to a document editing service.

## Test fixtures

Fixture sources and applicable notices are recorded in `tests/fixtures/assets/README.md`. User documents and notes are excluded from source control.

## Reading AI

- **Codex CLI / App Server** — optional separately installed OpenAI runtime, Apache-2.0; source: <https://github.com/openai/codex>. Paperly communicates with the official local process over stdio and does not redistribute its binary or copy authentication credentials.
- **jose** — MIT; OpenID Connect token signature and claim verification. Original notices are retained in the package.
- **react-markdown**, **remark-gfm**, **remark-math**, **rehype-katex** — MIT; Markdown and math processing, with original package notices retained.
- **KaTeX** — MIT; locally bundled formula rendering and fonts, with the package's original notices retained.

OpenAI and ChatGPT are third-party services and marks. Connecting an account uses OpenAI's documented authorization flow and is subject to the account's applicable terms, model access, and usage limits.
