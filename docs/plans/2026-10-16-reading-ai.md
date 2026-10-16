# 阅读 AI 与本地对话历史

- 使用官方 Sign in with ChatGPT 本地客户端授权（动态注册、PKCE、OIDC 验证），仅在用户点击连接时启动；凭证仅由本地后端持有。
- 从账号返回的模型目录选择模型，以 Responses SSE 流式生成；不自动切换到付费 API，不调用 ChatGPT 网页内部接口。
- 阅读器右侧在手写笔记和 AI 对话间切换。PDF 增加可选择文字的文本层；支持选中文字提问、全文总结、当前页公式截图解释。
- Word 使用当前编辑内容作为上下文；图片可作为视觉上下文；PPT 使用其本地 PDF 预览提取上下文。
- 对话按文件归档到 `data/conversations/`，支持流式中断、失败记录、重启恢复、检索、重命名、删除、导出和继续对话。
- 主页增加「对话历史」独立分页；分页查询所有本平台对话，显示来源文献并可返回原文。
- 回答保存为白板文字笔记，与来源卡片建立关系；保留来源对话和消息标识，避免重复保存。
- 验证：授权状态/签名/刷新与凭证隔离、真实本地 HTTP + 仿真上游 SSE 的持久化/取消/错误/分页测试、构建，以及浏览器操作验收。真实账号授权由用户完成，不代填账号或读取其他客户端凭证。

官方依据：

- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
