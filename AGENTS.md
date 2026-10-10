# 项目设计要点（吉他调音器 Guitar Tuner）

## 一、项目概述与技术栈

- 纯前端吉他调音器，Vue 3（`<script setup>`）+ Vite 5，产物为静态文件 `dist/`
- 包管理器：pnpm（有 `pnpm-lock.yaml`，不使用 npm/yarn）
- 最终托管在 Cloudflare Workers（纯静态资源，无 Worker 代码），配置见 `wrangler.jsonc`
- Worker 名称为 `guitar-tuner`，对应地址 https://guitar-tuner.fansong-yan.workers.dev
- 核心组件只有一个：`src/components/GuitarTuner.vue`，所有逻辑（检测、合成、UI）都在其中

## 二、常用命令

```bash
pnpm install                          # 安装依赖
pnpm dev                              # 本地开发
pnpm build                            # 构建到 dist/
pnpm exec wrangler deploy             # 发布（读取环境变量中的凭证）
# 合并发布：set -a; source .env; set +a; pnpm build && pnpm exec wrangler deploy
```

- 凭证 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 存放在仓库根目录 `.env`（已 gitignore，绝不提交或外传）
- 更换部署地址时只改 `wrangler.jsonc` 中的 `name`
- **产物混淆**：构建时 JS 会被 `javascript-obfuscator` 混淆（`vite.config.js` 中的 `obfuscatePlugin`，在 `generateBundle` 阶段处理，仅 build 生效，dev server 不受影响）；混淆后体积明显增大（约 82KB → 196KB，gzip 32KB → 62KB）属正常现象；不要开启 controlFlowFlattening / selfDefending / debugProtection，体积大且拖慢运行
- Cloudflare 边缘会自动对静态资源做 Brotli/Gzip 压缩，无需自行预压缩 dist

## 三、UI 设计规范：液态玻璃（Liquid Glass）

仿 macOS 新版毛玻璃风格，**所有容器和交互控件都必须玻璃化**，禁止使用不透明纯色卡片。

### 样式变量（定义在 `src/App.vue` 的 `:root`）

| 变量 | 用途 |
|------|------|
| `--glass` | 卡片底色 `rgba(255,255,255,0.42)` |
| `--glass-strong` | 悬浮/展开面板底色（更高不透明度） |
| `--glass-border` | 1px 白色高光边框 |
| `--glass-shadow` | 柔和外部投影 |
| `--glass-highlight` | `inset 0 1px 0 rgba(255,255,255,0.75)` 顶部高光线 |
| `--primary` | 深色玻璃 `rgba(28,28,30,0.78)`，用于选中/激活态胶囊 |

### 玻璃卡片标准写法

```css
background: var(--glass);
border: 1px solid var(--glass-border);
border-radius: 20px;                     /* 卡片 20px，控件 12px */
backdrop-filter: blur(24px) saturate(180%);
-webkit-backdrop-filter: blur(24px) saturate(180%);  /* Safari 必须带 -webkit- 前缀 */
box-shadow: var(--glass-shadow), var(--glass-highlight);
```

### 其他要点

- 页面背景是彩色渐变「壁纸」（App.vue 中多个 radial-gradient 光斑 + `background-attachment: fixed`），玻璃层叠在其上才有毛玻璃质感，改背景时保持多光斑结构
- 选中/激活态一律用深色玻璃胶囊（`--primary` + `inset` 顶部高光），参照分段控件样式
- 交互反馈：hover 上浮（`translateY(-1px)`）+ 加深阴影，按下回弹（`scale(0.99)`）
- **下拉菜单必须用自定义组件**（`.select-btn` + `.select-menu`），因为原生 `<select>` 的弹出层无法用 CSS 美化、且部分浏览器不给它应用 `backdrop-filter`；新增下拉一律复用这套样式
- **层叠上下文陷阱**：`.section` 的 `backdrop-filter` 会创建 stacking context，卡片内部的 `z-index` 无法盖住后面的兄弟卡片；任何玻璃卡片内弹出的浮层（下拉、tooltip 等），都要在展开时给所属卡片整体加 `position: relative; z-index: 30`（参照 `.section.dropdown-open`）
- **浮层透明度**：浮层会盖在下层文字上，底色必须用 `--glass-strong`（0.82 白）+ `blur(32px)` 级别的强模糊，不能用普通卡片的 0.42 透明白，否则下层文字透上来无法阅读；浮层内的 hover 态用 `rgba(30,41,80,0.07)` 淡色叠加而非白色
- 不支持 `backdrop-filter` 的浏览器需优雅降级（半透明白底仍可读）

## 四、音频逻辑要点

- **采样分析节流**：`ANALYSIS_INTERVAL = 200` ms，`processAudio()` 由 `requestAnimationFrame` 驱动但每 200ms 才做一次分析，避免读数跳动；RAF 调度必须放在函数开头，靠提前 `return` 跳帧，否则循环会中断
- **保持显示**：`HOLD_DURATION = 2500` ms，声音停止后旧读数保留 2.5s 并以 `holding` 状态变暗显示
- **音高检测**：自相关（autocorrelation）+ 抛物线插值细化周期；阈值必须按信号能量归一化（`bestCorr < 0.2 * rms * rms`），不要改回固定绝对阈值，否则轻弹检测不到
- **参考音合成**：Karplus-Strong 物理建模（噪声脉冲激励 + 反馈延迟线 + 低通阻尼），时长 3s
- 琴弦匹配：识别频率与目标弦频率差在约 12%（约 2 个半音）内才高亮该弦
- **琴弦显示顺序**：UI 从上到下为 1弦→6弦（`stringOrder` computed 倒序遍历），与真实持琴视角一致；内部数据索引仍按 0=6弦 … 5=1弦，改 UI 时不要颠倒数据索引
- 麦克风资源：`stopListening()` 必须停止所有 track、断开 source/analyser、取消 RAF 并重置 `lastAnalysisTime`

## 五、代码与文档规范

- 代码注释一律用中文（含分节标题、行内注释、模板 `<!-- -->` 和 CSS `/* */` 注释）
- 功能增删时同步更新 `README.md` 的「功能」章节
- 不擅自执行 `git commit`，不擅自启动 `pnpm dev` 调试；修改完成后提醒用户可自行提交/预览
- 大改动前先征得用户同意；用户明确要求「不要做大改动」时只做最小必要修改
- 改动后必须用 `pnpm build` 验证构建通过
