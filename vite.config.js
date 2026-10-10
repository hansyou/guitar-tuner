import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import JavaScriptObfuscator from 'javascript-obfuscator'

// javascript-obfuscator 配置：
// 保持在「混淆强度」与「体积/运行性能」之间的平衡，
// 关闭控制流扁平化、死代码注入、selfDefending、debugProtection（体积大且拖慢运行）
const OBFUSCATE_OPTIONS = {
  compact: true, // 移除换行空格，压缩为单行
  stringArray: true, // 字符串集中到数组
  stringArrayEncoding: ['base64'], // 字符串 base64 编码
  stringArrayThreshold: 0.8, // 约 80% 的字符串进数组
  controlFlowFlattening: false,
  deadCodeInjection: false,
  splitStrings: false,
  renameGlobals: false,
  selfDefending: false,
  debugProtection: false,
  target: 'browser',
}

// 构建结束后对所有 JS chunk 做混淆（generateBundle 阶段，晚于 esbuild 压缩）
// dev server 不受影响（apply: 'build'）
function obfuscatePlugin() {
  return {
    name: 'guitar-tuner:obfuscate',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        const chunk = bundle[fileName]
        if (chunk.type === 'chunk' && fileName.endsWith('.js')) {
          chunk.code = JavaScriptObfuscator.obfuscate(chunk.code, OBFUSCATE_OPTIONS).getObfuscatedCode()
          chunk.map = null
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [vue(), obfuscatePlugin()],
  build: {
    outDir: 'dist',
  },
})
