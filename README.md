# X 粉丝数显示

一个 Chrome 插件：在 X（Twitter）的时间线、粉丝列表、关注列表、推荐关注里，**直接在用户名旁边显示粉丝数**。

X 本身只在个人主页和悬停卡片里显示粉丝数，刷时间线、翻粉丝列表时看不到。这个插件把它补上：

- 刷时间线时，一眼看出发言的人有多少粉丝
- 翻「认证关注者 / 关注者」列表时，看出哪些有影响力的人关注了你
- 翻别人的「正在关注」列表找值得关注的账号时，有个参考

![时间线和粉丝列表](docs/images/timeline-and-followers.png)

（截图使用模拟数据。）

## 安装

插件还没上架商店，用「加载已解压的扩展程序」安装，一分钟搞定：

1. 下载插件：在 [Releases](https://github.com/jarvis-xy/x-follower-count/releases/latest) 下载 `x-follower-count-v<版本>.zip` 并解压；或者 `git clone` 本仓库
2. Chrome 地址栏打开 `chrome://extensions`（Edge 打开 `edge://extensions`）
3. 打开右上角的 **开发者模式**
4. 点 **加载已解压的扩展程序**，选择解压出来的文件夹（clone 的话选仓库里的 **`extension`** 文件夹）
5. 刷新已经打开的 x.com 页面

需要 Chrome / Edge 111 或更新版本。

## 使用

装好后打开 x.com 即可，不用任何配置。点工具栏上的插件图标可以调整：

| 设置 | 说明 |
| --- | --- |
| 启用插件 | 总开关 |
| 时间线推文 | 推文作者、引用推文的作者旁显示 |
| 用户列表 | 关注者、正在关注、推荐关注、搜索用户等列表里显示 |
| 数字格式 | `粉丝 17.4万` 或 `174.1K followers` |
| 按粉丝量级着色 | 灰：不到 1 千；蓝：1 千以上；紫：1 万以上；橙：10 万以上 |
| 清空记录 | 删除本机保存的粉丝数记录 |

鼠标悬停在粉丝数上，会显示精确数字、关注数和数据更新时间。

<img src="docs/images/popup.png" width="300" alt="设置面板">

## 原理与隐私

X 网页在加载时间线、粉丝列表时，自己发出的请求里本来就带着每个用户的粉丝数。插件只是**读取这些已有的返回结果**，再把数字显示到页面上：

- 不调用任何 API，不额外发请求，不需要登录信息或密钥
- 不上传任何数据；记录只保存在本机浏览器里（最多 1 万个账号，可随时清空）
- 只申请 `storage` 一个权限，只在 x.com / twitter.com 上运行

## 已知限制

- 只有经过 X 页面请求的用户才有数字。时间线和列表里的用户基本都会经过；偶尔有账号暂时没数字，下次刷到时会补上。
- 个人主页顶部和悬停卡片里 X 本来就显示粉丝数，插件不在那里重复显示。
- X 改版（接口字段或页面结构变化）可能让插件暂时失效，需要跟着更新。实现细节和改版时该查哪里见 [docs/实现说明.md](docs/实现说明.md)。

## 开发

插件本体在 `extension/`，没有构建步骤，改完在 `chrome://extensions` 里点刷新即可。

```bash
npm test             # 单元测试：数字格式、接口数据提取（Node 自带测试，无需安装依赖）
npm install          # 端到端测试需要 playwright-core
npm run test:e2e     # 把插件装进 Chromium，在模拟的 x.com 上跑完整流程，截图在 test/e2e/out/
npm run pack         # 打包成 dist/x-follower-count-v<版本>.zip，可用于上架商店
npm run icons        # 重新生成图标（需要 Python + Pillow）
npm run store:assets # 重新生成商店截图和宣传图，输出到 store/out/
```

```
extension/
  manifest.json
  src/inject.js      # 页面主环境：读取 X 自己的接口返回，提取 用户名 → 粉丝数
  src/content.js     # 插件隔离环境：缓存、读设置、在用户名旁插入粉丝数标签
  src/content.css    # 标签样式（适配 X 的浅色 / 深色主题）
  src/format.js      # 数字格式（17.4万 / 17.4K），插件页面和弹窗共用
  popup/             # 工具栏弹出的设置面板
test/                # 单元测试、端到端测试、模拟数据
docs/                # 实现说明
store/               # Chrome 应用商店上架资料、隐私政策、宣传图
```

## 反馈与贡献

X 改版后插件不显示数字、位置不对，欢迎提 [Issue](https://github.com/jarvis-xy/x-follower-count/issues)，最好附上出问题的页面（时间线 / 哪个列表）和截图。提 PR 前跑一遍 `npm test` 和 `npm run test:e2e`；改版排查思路见 [docs/实现说明.md](docs/实现说明.md)。

## 许可证

[MIT](LICENSE)

本插件是第三方工具，与 X Corp. 没有关联。
