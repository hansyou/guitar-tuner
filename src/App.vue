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
  --card: #ffffff;
  --surface: #f0f1f3;
  --border: #e0e1e4;
  --text: #1a1a1a;
  --text-dim: #999;
  --primary: #222;
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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  display: flex;
  justify-content: center;
  -webkit-font-smoothing: antialiased;
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
