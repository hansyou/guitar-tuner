<script setup>
import GuitarTuner from './components/GuitarTuner.vue'
</script>

<template>
  <div class="app">
    <GuitarTuner />
  </div>
</template>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #f5f5f5;
  /* 液态玻璃：半透明白 + 高光边框 + 柔和投影 */
  --glass: rgba(255, 255, 255, 0.42);
  --glass-strong: rgba(255, 255, 255, 0.82);
  --glass-border: rgba(255, 255, 255, 0.55);
  --glass-shadow: 0 8px 28px rgba(30, 41, 80, 0.12);
  --glass-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.75);
  --card: rgba(255, 255, 255, 0.42);
  --surface: rgba(255, 255, 255, 0.38);
  --border: rgba(255, 255, 255, 0.5);
  --text: #1a1a1a;
  --text-dim: #7c7c85;
  --primary: rgba(28, 28, 30, 0.78);
  --accent: #666;
  --good: #3d8b40;
  --warn: #c79100;
  --hi-e: #c93a3a;
  --b:   #c79100;
  --g:   #3d8b40;
  --d:   #3a7cc9;
  --a:   #7b4b9a;
  --lo-e:#c93a3a;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', 'Segoe UI', Roboto, sans-serif;
  color: var(--text);
  min-height: 100vh;
  display: flex;
  justify-content: center;
  -webkit-font-smoothing: antialiased;
  /* macOS 风格彩色渐变壁纸，玻璃层叠加其上产生毛玻璃质感 */
  background:
    radial-gradient(60% 50% at 18% 18%, rgba(120, 160, 255, 0.55) 0%, transparent 70%),
    radial-gradient(50% 45% at 82% 12%, rgba(255, 150, 190, 0.5) 0%, transparent 70%),
    radial-gradient(55% 50% at 78% 82%, rgba(130, 220, 180, 0.5) 0%, transparent 70%),
    radial-gradient(45% 45% at 15% 85%, rgba(255, 210, 140, 0.45) 0%, transparent 70%),
    linear-gradient(165deg, #eef1f8 0%, #e6eaf4 100%);
  background-attachment: fixed;
}

#app {
  width: 100%;
  max-width: 640px;
  padding: 24px 16px;
}

.app {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
