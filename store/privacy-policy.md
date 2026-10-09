# X Follower Count 隐私政策

生效日期：2026 年 10 月 9 日

「X Follower Count」（以下简称“本扩展”）是一个 Chrome 浏览器扩展，用于在 x.com 和 twitter.com 页面的用户名旁显示该用户的粉丝数。本政策说明本扩展如何处理数据。

## 本扩展读取哪些数据

当你浏览 x.com 或 twitter.com 时，X 网页会自行向 X 的服务器请求时间线、用户列表等内容。本扩展在你的浏览器内读取这些请求已返回的内容，只从中提取公开的账号信息：用户名（@handle）、粉丝数和关注数。

在关注者、正在关注等用户列表里，本扩展还会读取页面上已经显示的关注状态（你是否关注了对方、对方是否显示「关注了你」），只用于当场标出「未回关」，不保存，也不发送到任何地方。

本扩展不读取你的密码、私信、浏览记录或其他网站的内容，也不会额外向 X 或任何其他服务器发出请求。

## 数据保存在哪里

- 提取到的「用户名 → 粉丝数、关注数、记录时间」保存在你本机浏览器的扩展存储（chrome.storage.local）中，最多 10,000 条，用于刷新页面后继续显示。
- 你的显示设置（开关、数字格式、是否按量级着色）保存在 chrome.storage.sync 中。如果你开启了 Chrome 同步，Chrome 会按其自身机制在你的设备间同步这些设置。

## 数据不会被分享

本扩展不会把任何数据发送给开发者或任何第三方，不出售数据，不将数据用于广告、信用评估或与本扩展功能无关的用途。本扩展不包含任何统计、分析或远程代码。

## 如何删除数据

- 点击浏览器工具栏中的本扩展图标，在设置面板中点「清空记录」，即可删除本机保存的全部粉丝数记录。
- 卸载本扩展会删除它保存的全部数据。

## 政策变更与联系方式

如本政策有变更，会更新本页面并修改生效日期。如有疑问，请通过 Chrome 网上应用店中本扩展页面上的开发者联系方式与我们联系。

本扩展是第三方工具，与 X Corp. 没有关联。

---

# Privacy Policy — X Follower Count

Effective date: October 9, 2026

X Follower Count ("the extension") is a Chrome extension that shows each user's follower count next to their name on x.com and twitter.com.

**What it reads.** While you browse x.com or twitter.com, the X web app requests timelines and user lists from X's servers. The extension reads those already-returned responses inside your browser and extracts only public account information: the username (@handle), follower count and following count. In user lists it also reads the follow status already shown on the page (whether you follow someone and whether X shows "Follows you"), only to tag people who don't follow you back; this is not stored or sent anywhere. It does not read passwords, direct messages, your browsing history or any other website, and it makes no network requests of its own.

**Where data is stored.** The extracted "username → follower count, following count, time recorded" records are stored locally in your browser (chrome.storage.local, up to 10,000 entries) so counts still show after a reload. Your display settings are stored in chrome.storage.sync and may be synced across your devices by Chrome if you use Chrome Sync.

**No sharing.** The extension sends no data to the developer or any third party, does not sell data, and does not use data for advertising, creditworthiness or any purpose unrelated to its single function. It contains no analytics, tracking or remote code.

**Deleting data.** Click the extension's toolbar icon and choose 清空记录 ("Clear records") to delete all stored records. Uninstalling the extension removes all of its data.

**Changes and contact.** Changes to this policy will be posted on this page with a new effective date. For questions, use the developer contact shown on the extension's Chrome Web Store page.

This extension is a third-party tool and is not affiliated with X Corp.
