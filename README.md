# myblog

一个适合部署到 Render 免费 Web Service 的私人笔记网站。

## 本地运行

```bash
npm start
```

打开：

```text
http://127.0.0.1:4173
```

## 访问规则

- 普通页面始终能打开，但文章列表默认不会加载。
- 右下角邀请码框输入 `yjlsx`：进入正常文章页面。
- 浏览器地址输入 `/admin`：进入管理员登录页面。
- 文章列表每页显示 10 篇，超过后会自动出现分页。
- 点击文章标题会进入 `/post/文章id` 的完整文章页面。

默认开发值：

```text
邀请码：yjlsx
管理员账号：yjlsx
管理员密码：yjl021410
```

部署到 Render 后，建议在环境变量中覆盖这些值。

## Render 环境变量

必填：

```text
INVITE_CODE=你的邀请码
ADMIN_USERNAME=你的管理员账号
ADMIN_PASSWORD=你的管理员密码
SESSION_SECRET=一串随机长字符
```

如果你希望管理员在 Render 上发布文章后能永久保存到 GitHub 私有仓库，再配置：

```text
GITHUB_TOKEN=具有 Contents read/write 权限的 GitHub fine-grained token
GITHUB_REPO=用户名/仓库名
GITHUB_BRANCH=main
```

文章会保存到：

```text
content/posts/*.md
```

上传图片会保存到：

```text
assets/uploads/
```

如果不配置 GitHub 变量，管理员发布只会写入 Render 运行时磁盘；免费实例重启或重新部署后，这些运行时改动可能丢失。

## 正文格式

管理员编辑器支持这些正文格式：

```text
## 小标题
**加粗**
*斜体*
> 引用
[center]居中文本[/center]
[color=#315f58]带颜色的文字[/color]
[size=28]指定字号的文字[/size]
![图片说明](图片地址)
---
```

管理员编辑器也支持导入正文：

- `.txt`：直接导入文本
- `.docx`：提取 Word 正文段落
- `.doc`：旧格式暂不支持，请先另存为 `.docx` 或 `.txt`

正文会自动做一层中文排版优化：

- `一、标题`、`二、标题` 会识别为小节标题
- `第一章 标题`、`第二部分 标题` 会识别为小节标题
- `1. 条目`、`一、条目` 这类连续多行会识别为列表
- 普通正文段落会自动首行缩进两个字符
