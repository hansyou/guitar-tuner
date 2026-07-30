# 🎸 Guitar Tuner

一个纯前端的吉他调音器。

## 功能

- **听音调弦** — 点击琴弦播放该弦的标准音（Karplus-Strong 物理建模合成，模拟真实吉他拨弦），用户对照调弦
- **实时听音** — 通过麦克风捕捉琴声，实时检测音高并与标准音对比，显示音名和偏差音分（cents）
- **多种调弦** — Standard (EADGBE)、Drop D、Open D、Open G、Open A、Drop C
- **传统乐谱记法** — 音符以 F♯₃ / E♭₂ 的上标形式显示

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

直接上传静态资源部署即可。
