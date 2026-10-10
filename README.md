# 🎸 Guitar Tuner

一个纯前端的吉他调音器。

## 功能

- **听音调弦** — 点击琴弦播放该弦的标准音（Karplus-Strong 物理建模合成，模拟真实吉他拨弦），用户对照调弦
- **实时听音** — 通过麦克风捕捉琴声，实时检测音高并与标准音对比，显示音名和偏差音分（cents）
- **多种调弦** — Standard (EADGBE)、Drop D、Open D、Open G、Open A、Drop C
- **传统乐谱记法** — 音符以 F♯₃ / E♭₂ 的上标形式显示
- **液态玻璃 UI** — 仿新版 macOS「Liquid Glass」的半透明毛玻璃界面
- **平滑读数** — 音高分析每 0.2 秒一次，表盘以 0.2s 缓动过渡，读数不乱跳

## 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建
pnpm build
```

## 部署到 Cloudflare Workers

项目已配置好 wrangler（见 `wrangler.jsonc`），静态资源直接托管到 Worker `guitar-tuner`，发布只需构建 + 上传两步：

```bash
# 1. 构建静态资源到 dist/
pnpm build

# 2. 发布（上传 dist/ 目录到 Workers）
pnpm exec wrangler deploy
```

也可以合并成一条命令：

```bash
set -a; source .env; set +a; pnpm build && pnpm exec wrangler deploy
```

说明：

- 凭证来自环境变量 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`，仓库根目录的 `.env.default` 已写好这两个值示例（不会提交到 git），复制一份 `.env`，填好自己的账户信息，用上面的 `source .env` 方式加载即可
- 发布地址：https://guitar-tuner.fansong-yan.workers.dev
- 更换 Worker 名称：修改 `wrangler.jsonc` 中的 `name`
