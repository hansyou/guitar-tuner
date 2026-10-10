<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'

// ─── 调弦预设 ───────────────────────────────────────────────────
const TUNINGS = [
  { label: 'Standard (E A D G B E)', notes: ['E2','A2','D3','G3','B3','E4'] },
  { label: 'Drop D (D A D G B E)',   notes: ['D2','A2','D3','G3','B3','E4'] },
  { label: 'Open D (D A D F♯ A D)',  notes: ['D2','A2','D3','F#3','A3','D4'] },
  { label: 'Open G (D G D G B D)',   notes: ['D2','G2','D3','G3','B3','D4'] },
  { label: 'Open A (E A C♯ E A E)',  notes: ['E2','A2','C#3','E3','A3','E4'] },
  { label: 'Drop C (C G C F A D)',   notes: ['C2','G2','C3','F3','A3','D4'] },
]

const STRING_NAMES = ['6弦', '5弦', '4弦', '3弦', '2弦', '1弦']

const NOTE_TO_FREQ = {
  'C0':16.35,'C#0':17.32,'Db0':17.32,'D0':18.35,'D#0':19.45,'Eb0':19.45,'E0':20.60,'F0':21.83,'F#0':23.12,'Gb0':23.12,'G0':24.50,'G#0':25.96,'Ab0':25.96,'A0':27.50,'A#0':29.14,'Bb0':29.14,'B0':30.87,
  'C1':32.70,'C#1':34.65,'Db1':34.65,'D1':36.71,'D#1':38.89,'Eb1':38.89,'E1':41.20,'F1':43.65,'F#1':46.25,'Gb1':46.25,'G1':49.00,'G#1':51.91,'Ab1':51.91,'A1':55.00,'A#1':58.27,'Bb1':58.27,'B1':61.74,
  'C2':65.41,'C#2':69.30,'Db2':69.30,'D2':73.42,'D#2':77.78,'Eb2':77.78,'E2':82.41,'F2':87.31,'F#2':92.50,'Gb2':92.50,'G2':98.00,'G#2':103.83,'Ab2':103.83,'A2':110.00,'A#2':116.54,'Bb2':116.54,'B2':123.47,
  'C3':130.81,'C#3':138.59,'Db3':138.59,'D3':146.83,'D#3':155.56,'Eb3':155.56,'E3':164.81,'F3':174.61,'F#3':185.00,'Gb3':185.00,'G3':196.00,'G#3':207.65,'Ab3':207.65,'A3':220.00,'A#3':233.08,'Bb3':233.08,'B3':246.94,
  'C4':261.63,'C#4':277.18,'Db4':277.18,'D4':293.66,'D#4':311.13,'Eb4':311.13,'E4':329.63,'F4':349.23,'F#4':369.99,'Gb4':369.99,'G4':392.00,'G#4':415.30,'Ab4':415.30,'A4':440.00,'A#4':466.16,'Bb4':466.16,'B4':493.88,
  'C5':523.25,'C#5':554.37,'Db5':554.37,'D5':587.33,'D#5':622.25,'Eb5':622.25,'E5':659.25, 'F5':698.46,'F#5':739.99,'Gb5':739.99,'G5':783.99,'G#5':830.61,'Ab5':830.61,'A5':880.00,'A#5':932.33,'Bb5':932.33,'B5':987.77,
}

const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

// 将音名（如 "E2"、"F#3"）转换为频率
function noteToFreq(note) {
  return NOTE_TO_FREQ[note] || 0
}

// 解析音名为显示部件："F#3" → { letter: 'F', acc: '♯', octave: '3' }
// 同时兼容 "#"/"b" 与显示用字符 "♯"/"♭"。
function parseNote(raw) {
  const m = raw.match(/^([A-G])([#♯b♭])(\d)$/)
  if (m) {
    return { letter: m[1], acc: m[2] === 'b' || m[2] === '♭' ? '♭' : '♯', octave: m[3] }
  }
  const m2 = raw.match(/^([A-G])(\d)$/)
  if (m2) {
    return { letter: m2[1], acc: '', octave: m2[2] }
  }
  return { letter: raw, acc: '', octave: '' }
}

const parsedNotes = computed(() => tuning.value.notes.map(parseNote))

// 琴弦显示顺序：1弦（最细）在最上方，6弦（最粗）在最下方
// 仅倒序显示，内部索引仍按 0=6弦 … 5=1弦 对应调弦数据
const stringOrder = computed(() => tuning.value.notes.map((_, i) => i).reverse())

// 已识别音名的显示
const detectedDisplay = computed(() => {
  if (!detected.name || detected.name === '--') return { letter: '--', acc: '', octave: '' }
  return parseNote(detected.name)
})

// 将频率转换为 MIDI 音高编号
function freqToMidi(freq) {
  return 12 * (Math.log2(freq) - Math.log2(440)) + 69
}

// 将频率转换为最近的音名及音分偏差
function freqToNote(freq) {
  if (freq <= 0) return { name: '--', cents: 0, freq: 0 }
  const midi = freqToMidi(freq)
  const semitone = Math.round(midi)
  const cents = Math.round((midi - semitone) * 100)
  const octave = Math.floor(semitone / 12) - 1
  const noteIndex = ((semitone % 12) + 12) % 12
  const name = CHROMATIC[noteIndex] + octave
  return {
    name: name.replace('#', '♯'),
    cents,
    freq: Math.round(freq * 100) / 100,
    semitone,
  }
}

// ─── 状态 ────────────────────────────────────────────────────────
const tuningIndex = ref(0)

// 调弦下拉菜单状态
const dropdownOpen = ref(false)
const selectWrapEl = ref(null)

// 选择调弦并关闭下拉菜单
function chooseTuning(i) {
  tuningIndex.value = i
  dropdownOpen.value = false
}

// 点击菜单外部时关闭下拉菜单
function handleDocClick(e) {
  if (selectWrapEl.value && !selectWrapEl.value.contains(e.target)) {
    dropdownOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleDocClick))
onUnmounted(() => document.removeEventListener('click', handleDocClick))
const mode = ref('listen') // 模式：'listen' 实时听音 | 'reference' 听音调弦
const activeString = ref(-1)
const isListening = ref(false)
const detected = reactive({ name: '--', cents: 0, freq: 0, confidence: 0 })
const playingString = ref(-1)

// 声音停止后仍短暂保留最后一次识别的音符，
// 让用户有时间读取，之后显示才会复位。
const HOLD_DURATION = 2500 // 毫秒

// 采样分析间隔（毫秒）：每 0.2 秒分析一次，
// 避免逐帧更新导致读数频繁跳动
const ANALYSIS_INTERVAL = 200
let lastAnalysisTime = 0
const holding = ref(false)
let hasDetected = false
let lastDetectionTime = 0

const tuning = computed(() => TUNINGS[tuningIndex.value])
const targetFreqs = computed(() => tuning.value.notes.map(noteToFreq))

// ─── 音频状态 ────────────────────────────────────────────────────
let audioCtx = null
let currentSource = null
let analyser = null
let mediaStream = null
let animationId = null
let micSource = null

// ─── 音高检测（自相关算法） ──────────────────────────────────────
function autoCorrelate(buffer, sampleRate) {
  // RMS 能量检查
  let rms = 0
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i]
  rms = Math.sqrt(rms / buffer.length)
  if (rms < 0.005) return -1

  const size = buffer.length
  const minPeriod = Math.floor(sampleRate / 1600) // 最高约 1600Hz
  const maxPeriod = Math.floor(sampleRate / 30)   // 吉他最低约 30Hz

  let bestPeriod = 0
  let bestCorr = 0

  for (let period = minPeriod; period < maxPeriod; period++) {
    let corr = 0
    for (let i = 0; i < maxPeriod; i++) {
      if (i + period < size) corr += buffer[i] * buffer[i + period]
    }
    corr /= maxPeriod
    if (corr > bestCorr) {
      bestCorr = corr
      bestPeriod = period
    }
  }

  // 与信号能量（rms²）比较，而不是使用固定绝对阈值，
  // 这样轻弹也能被识别。周期性达到约 20% 能量即视为真实音高。
  if (bestCorr < 0.2 * rms * rms || bestPeriod === 0) return -1

  // 抛物线插值以提高精度
  const y0 = bestCorr
  const y1 = bestPeriod > minPeriod
    ? (() => {
        let c = 0
        for (let i = 0; i < maxPeriod; i++) {
          if (i + bestPeriod - 1 < size) c += buffer[i] * buffer[i + bestPeriod - 1]
        }
        return c / maxPeriod
      })()
    : 0
  const y2 = bestPeriod + 1 < maxPeriod
    ? (() => {
        let c = 0
        for (let i = 0; i < maxPeriod; i++) {
          if (i + bestPeriod + 1 < size) c += buffer[i] * buffer[i + bestPeriod + 1]
        }
        return c / maxPeriod
      })()
    : 0

  let refinedPeriod = bestPeriod
  if (y0 > y1 && y0 > y2) {
    const a = y2 - 2 * y0 + y1
    const b = y2 - y1
    if (a !== 0) {
      refinedPeriod = bestPeriod + b / (2 * a)
    }
  }

  return sampleRate / refinedPeriod
}

// ─── 音频处理循环 ────────────────────────────────────────────────
function processAudio() {
  if (!analyser) return
  // 无论是否分析，都保持动画循环运行
  animationId = requestAnimationFrame(processAudio)

  // 按 ANALYSIS_INTERVAL 节流：间隔未到则跳过本次分析
  const now = performance.now()
  if (now - lastAnalysisTime < ANALYSIS_INTERVAL) return
  lastAnalysisTime = now

  const bufferLength = analyser.fftSize
  const buffer = new Float32Array(bufferLength)
  analyser.getFloatTimeDomainData(buffer)

  const sampleRate = audioCtx.sampleRate
  const freq = autoCorrelate(buffer, sampleRate)

  if (freq > 0 && freq < 1600) {
    const note = freqToNote(freq)
    detected.name = note.name
    detected.cents = note.cents
    detected.freq = note.freq
    detected.confidence = 1
    hasDetected = true
    lastDetectionTime = performance.now()
    holding.value = false

    // 找到最接近的目标琴弦
    const freqs = targetFreqs.value
    let minDiff = Infinity
    let closest = -1
    freqs.forEach((tf, i) => {
      if (tf > 0) {
        const diff = Math.abs(freq - tf)
        if (diff < minDiff) {
          minDiff = diff
          closest = i
        }
      }
    })
    // 仅在偏差约 2 个半音以内时才高亮该弦
    if (closest >= 0 && minDiff < targetFreqs.value[closest] * 0.12) {
      activeString.value = closest
    } else {
      activeString.value = -1
    }
  } else {
    // 本帧没有有效音高。短暂保留上一次结果，
    // 而不是立即清空，让读数保持可见。
    if (hasDetected && performance.now() - lastDetectionTime < HOLD_DURATION) {
      holding.value = true
      detected.confidence = 0.6 // 稍微变暗，表示不再是实时数据
    } else if (hasDetected) {
      detected.name = '--'
      detected.cents = 0
      detected.freq = 0
      detected.confidence = 0
      activeString.value = -1
      hasDetected = false
      holding.value = false
    }
  }
}

// ─── 启动麦克风 ──────────────────────────────────────────────────
async function startListening() {
  if (isListening.value) return
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume()

    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    micSource = audioCtx.createMediaStreamSource(mediaStream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 2048
    micSource.connect(analyser)

    isListening.value = true
    hasDetected = false
    holding.value = false
    processAudio()
  } catch (e) {
    console.error('Microphone access denied:', e)
    alert('需要麦克风权限才能使用听音模式。请在浏览器中允许麦克风访问。')
  }
}

function stopListening() {
  if (animationId) cancelAnimationFrame(animationId)
  animationId = null
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop())
    mediaStream = null
  }
  if (micSource) micSource.disconnect()
  if (analyser) analyser.disconnect()
  analyser = null
  micSource = null
  isListening.value = false
  activeString.value = -1
  detected.name = '--'
  detected.cents = 0
  detected.freq = 0
  detected.confidence = 0
  hasDetected = false
  holding.value = false
  lastAnalysisTime = 0 // 重新监听时立即进行第一次分析
}

// ─── Karplus-Strong 拨弦合成 ────────────────────────────────────
// 拨弦物理建模：噪声脉冲激励带低通滤波的反馈延迟线，
// 产生带有自然泛音与衰减、音色丰富的吉他音。
function synthesizeString(audioCtx, freq, duration) {
  const sampleRate = audioCtx.sampleRate
  const period = Math.round(sampleRate / freq)
  const totalSamples = Math.ceil(sampleRate * duration)

  const buffer = audioCtx.createBuffer(1, totalSamples, sampleRate)
  const data = buffer.getChannelData(0)

  // ── 激励：指数衰减的整形噪声脉冲 ──
  // 模拟拨片初次拨动琴弦的瞬态
  const exciterLen = Math.min(period, Math.ceil(sampleRate * 0.008))
  for (let i = 0; i < exciterLen; i++) {
    // 白噪声上的三角形幅度包络
    const env = 1 - i / exciterLen
    data[i] = (Math.random() * 2 - 1) * 0.6 * env * env
  }

  // ── Karplus-Strong 延迟线与低通阻尼 ──────────
  // damping（阻尼）：0.998 延音长（吉他约 3 秒），0.99 衰减更快
  // brightness（明亮度）：控制低通滤波器截止频率（越高越明亮）
  // 低音弦阻尼略小，以补偿物理衰减
  const brightness = 0.4 + 0.6 * (freq / 440) // 音越高越明亮
  const damping = 0.997 + 0.0015 * (freq / 440) // 低音延音更长

  for (let i = period; i < totalSamples; i++) {
    // 反馈回路中用两点移动平均作低通滤波
    const delayed = data[i - period]
    const delayedPrev = i - period - 1 >= 0 ? data[i - period - 1] : delayed
    // 混合：延迟样本与其相邻样本的加权平均
    // 对反馈信号构成一个简单的一阶低通滤波
    const blended = brightness * delayed + (1 - brightness) * delayedPrev
    data[i] = blended * damping
  }

  // ── 平滑淡出，避免爆音 ───────────────────────────
  const fadeStart = totalSamples - Math.ceil(sampleRate * 0.05)
  for (let i = Math.max(0, fadeStart); i < totalSamples; i++) {
    const fadeProgress = (i - fadeStart) / (totalSamples - fadeStart)
    data[i] *= 1 - fadeProgress
  }

  return buffer
}

// ─── 播放参考音 ──────────────────────────────────────────────────
async function playReference(stringIdx) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') await audioCtx.resume()

  stopReference()

  const freq = targetFreqs.value[stringIdx]
  if (!freq) return

  if (isListening.value) stopListening()

  playingString.value = stringIdx

  // 合成拨弦音色
  const duration = 3.0 // 3 秒自然衰减的延音
  const buffer = synthesizeString(audioCtx, freq, duration)

  const source = audioCtx.createBufferSource()
  source.buffer = buffer

  const gainNode = audioCtx.createGain()
  // 温和的增益包络：快速起音，
  // 其余交给缓冲区的自然衰减
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime)
  gainNode.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + 0.008)
  gainNode.gain.setValueAtTime(0.7, audioCtx.currentTime + duration - 0.05)
  gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration)
  gainNode.connect(audioCtx.destination)

  source.connect(gainNode)
  source.start()
  source.stop(audioCtx.currentTime + duration + 0.1)

  source.onended = () => {
    gainNode.disconnect()
    source.disconnect()
    if (currentSource === source) currentSource = null
    playingString.value = -1
  }

  currentSource = source
}

function stopReference() {
  if (currentSource) {
    try { currentSource.stop() } catch (e) {}
    currentSource.disconnect()
    currentSource = null
  }
  playingString.value = -1
}

// ─── 切换模式 ────────────────────────────────────────────────────
function switchMode(newMode) {
  if (mode.value === newMode) return
  mode.value = newMode
  if (newMode === 'listen') {
    stopReference()
    startListening()
  } else {
    stopListening()
  }
}

// ─── 资源清理 ────────────────────────────────────────────────────
onUnmounted(() => {
  stopListening()
  stopReference()
  if (audioCtx) {
    audioCtx.close()
    audioCtx = null
  }
})

// 组件挂载时不自动开始监听，
// 由用户点击按钮手动启动

// ─── 辅助函数 ────────────────────────────────────────────────────
function formatCents(cents) {
  if (cents === 0) return '±0¢'
  return cents > 0 ? `+${cents}¢` : `${cents}¢`
}

function centsOffset(cents) {
  // 归一化到 -50..50 范围
  let c = cents
  while (c > 50) c -= 100
  while (c < -50) c += 100
  return c
}

function centsToPercent(cents) {
  // -50 音分 => 0%，0 => 50%，+50 => 100%
  return 50 + centsOffset(cents) * 0.5
}

const stringColors = ['var(--lo-e)', 'var(--a)', 'var(--d)', 'var(--g)', 'var(--b)', 'var(--hi-e)']
</script>

<template>
  <div class="tuner">
    <header class="header">
      <h1 class="title">🎸 吉他调音器</h1>
    </header>

    <!-- 调弦选择（自定义玻璃下拉菜单） -->
    <section :class="['section', { 'dropdown-open': dropdownOpen }]">
      <label class="label">调弦选择</label>
      <div ref="selectWrapEl" class="select-wrap">
        <button
          type="button"
          :class="['select-btn', { open: dropdownOpen }]"
          @click="dropdownOpen = !dropdownOpen"
        >
          <span class="select-value">{{ tuning.label }}</span>
          <span :class="['select-arrow', { open: dropdownOpen }]"></span>
        </button>
        <Transition name="dropdown">
          <ul v-if="dropdownOpen" class="select-menu">
            <li
              v-for="(t, i) in TUNINGS"
              :key="i"
              :class="['select-option', { active: tuningIndex === i }]"
              @click="chooseTuning(i)"
            >
              <span>{{ t.label }}</span>
              <span v-if="tuningIndex === i" class="select-check">✓</span>
            </li>
          </ul>
        </Transition>
      </div>
    </section>

    <!-- 模式切换 -->
    <section class="section">
      <div class="mode-tabs">
        <button
          :class="['mode-tab', { active: mode === 'reference' }]"
          @click="switchMode('reference')"
        >
          🔊 听音调弦
        </button>
        <button
          :class="['mode-tab', { active: mode === 'listen' }]"
          @click="switchMode('listen')"
        >
          🎤 实时听音
        </button>
      </div>
    </section>

    <!-- 听音调弦模式 -->
    <template v-if="mode === 'reference'">
      <section class="section">
        <p class="hint">点击琴弦播放标准音，对照调弦</p>
        <div class="strings">
          <button
            v-for="i in stringOrder"
            :key="i"
            :class="['string-btn', { playing: playingString === i }]"
            :style="{ '--color': stringColors[i] }"
            @click="playReference(i)"
          >
            <span class="string-num">{{ STRING_NAMES[i] }}</span>
            <span class="string-note">
              {{ parsedNotes[i].letter }}<sup v-if="parsedNotes[i].acc">{{ parsedNotes[i].acc }}</sup><sub>{{ parsedNotes[i].octave }}</sub>
            </span>
            <span class="string-freq">{{ targetFreqs[i].toFixed(1) }}Hz</span>
          </button>
        </div>
      </section>
    </template>

    <!-- 实时听音模式 -->
    <template v-if="mode === 'listen'">
      <section class="section">
        <div class="mic-area">
          <button
            :class="['mic-btn', { active: isListening }]"
            @click="isListening ? stopListening() : startListening()"
          >
            <span class="mic-icon">{{ isListening ? '🛑' : '🎤' }}</span>
            <span>{{ isListening ? '停止监听' : '开始监听' }}</span>
          </button>
        </div>

        <!-- 识别结果显示 -->
        <div class="detection" v-if="isListening">
          <div class="detected-note">
            <span class="note-name" :class="{ dim: !detected.confidence, holding: holding }">
              <span v-if="detectedDisplay.letter !== '--'">
                {{ detectedDisplay.letter }}<sup v-if="detectedDisplay.acc">{{ detectedDisplay.acc }}</sup><sub>{{ detectedDisplay.octave }}</sub>
              </span>
              <span v-else>--</span>
            </span>
            <span class="note-freq" v-if="detected.freq">{{ detected.freq }} Hz</span>
            <span class="hold-hint" v-if="holding">音已识别 · 保持显示中</span>
          </div>

          <!-- 音分表 -->
          <div class="meter-wrap">
            <div class="meter-track">
              <div class="meter-fill" :style="{ width: centsToPercent(detected.cents) + '%' }"></div>
              <div class="meter-center"></div>
              <!-- 目标音标记 -->
              <div
                v-for="(freq, i) in targetFreqs"
                :key="i"
                class="target-marker"
                :style="{ left: (i / 5) * 100 + '%' }"
                :class="{ active: activeString === i }"
              >
                <div class="target-dot" :style="{ background: stringColors[i] }"></div>
              </div>
            </div>
            <div class="meter-labels">
              <span>♭ 偏低</span>
              <span v-if="activeString >= 0" class="active-string-hint">
                {{ STRING_NAMES[activeString] }} ·
                <span v-if="parsedNotes[activeString]">
                  {{ parsedNotes[activeString].letter }}<sup v-if="parsedNotes[activeString].acc">{{ parsedNotes[activeString].acc }}</sup><sub>{{ parsedNotes[activeString].octave }}</sub>
                </span>
              </span>
              <span>偏高 ♯</span>
            </div>
            <div class="cents-value" v-if="detected.freq">
              <span :class="{ good: Math.abs(centsOffset(detected.cents)) < 5, ok: Math.abs(centsOffset(detected.cents)) >= 5 && Math.abs(centsOffset(detected.cents)) < 15 }">
                {{ formatCents(centsOffset(detected.cents)) }}
              </span>
            </div>
          </div>

          <!-- 各琴弦状态 -->
          <div class="string-status-list">
            <div
              v-for="i in stringOrder"
              :key="i"
              :class="['string-row', { active: activeString === i, 'dimmed': activeString >= 0 && activeString !== i }]"
            >
              <span class="s-num">{{ STRING_NAMES[i] }}</span>
              <span class="s-note" v-if="parsedNotes[i]">
                {{ parsedNotes[i].letter }}<sup v-if="parsedNotes[i].acc">{{ parsedNotes[i].acc }}</sup><sub>{{ parsedNotes[i].octave }}</sub>
              </span>
              <span class="s-bar-wrap">
                <span
                  class="s-bar"
                  :style="{
                    width: activeString === i ? Math.abs(centsOffset(detected.cents)) * 2 + '%' : '0%',
                    background: stringColors[i],
                  }"
                ></span>
              </span>
              <span class="s-status" v-if="activeString === i">
                <template v-if="Math.abs(centsOffset(detected.cents)) < 3">✅ 准</template>
                <template v-else-if="centsOffset(detected.cents) > 0">⬆️ 高</template>
                <template v-else>⬇️ 低</template>
              </span>
            </div>
          </div>
        </div>

        <div class="placeholder" v-else>
          <p>点击「开始监听」用麦克风捕捉吉他声音</p>
          <p class="small">确保琴声清晰，环境安静</p>
        </div>
      </section>
    </template>

    <footer class="footer">
      <p>部署于 Cloudflare Workers · 数据仅存于本地浏览器</p>
    </footer>
  </div>
</template>

<style scoped>
.tuner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 0 32px;
}

.header {
  text-align: center;
  padding: 0 0 4px;
}

.title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
}

.section {
  background: var(--glass);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  padding: 18px;
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow: var(--glass-shadow), var(--glass-highlight);
}

/* backdrop-filter 会创建层叠上下文：玻璃卡片的 z-index 出不了本卡片，
   下方的兄弟卡片会盖住弹出菜单。菜单展开时把所属卡片整体提到最上层 */
.section.dropdown-open {
  position: relative;
  z-index: 30;
}

.label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-dim);
  margin-bottom: 8px;
}

/* 调弦下拉菜单（自定义组件，保证整体液态玻璃风格一致） */
.select-wrap {
  position: relative;
}

.select-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.5);
  color: var(--text);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  font-size: 0.95rem;
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: var(--glass-highlight), 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: background 0.15s, border-color 0.15s;
}

.select-btn:hover,
.select-btn.open {
  background: rgba(255, 255, 255, 0.65);
  border-color: rgba(0, 122, 255, 0.35);
}

.select-value {
  flex: 1;
  text-align: left;
}

/* 下拉箭头 */
.select-arrow {
  width: 10px;
  height: 10px;
  margin-left: 10px;
  background-color: var(--text-dim);
  clip-path: polygon(0% 25%, 50% 75%, 100% 25%, 100% 50%, 50% 100%, 0% 50%);
  transition: transform 0.2s;
}

.select-arrow.open {
  transform: rotate(180deg);
}

/* 弹出菜单面板 */
.select-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  margin: 0;
  padding: 6px;
  list-style: none;
  /* 浮层专用高不透明度玻璃 + 强模糊，避免下层文字透上来干扰阅读 */
  background: var(--glass-strong);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  backdrop-filter: blur(32px) saturate(180%);
  -webkit-backdrop-filter: blur(32px) saturate(180%);
  box-shadow: 0 14px 36px rgba(30, 41, 80, 0.2), var(--glass-highlight);
}

.select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 0.95rem;
  color: var(--text);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.select-option:hover {
  background: rgba(30, 41, 80, 0.07);
}

/* 选中项：深色玻璃胶囊 */
.select-option.active {
  background: var(--primary);
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.select-check {
  font-size: 0.85rem;
}

/* 下拉动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

/* 模式切换标签（macOS 分段控件样式） */
.mode-tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: var(--glass-highlight), inset 0 1px 4px rgba(30, 41, 80, 0.06);
}

.mode-tab {
  flex: 1;
  padding: 9px 0;
  background: transparent;
  color: var(--text-dim);
  border: none;
  border-radius: 9px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}

.mode-tab.active {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.mode-tab:hover:not(.active) {
  background: rgba(255, 255, 255, 0.45);
  color: var(--text);
}

/* 听音调弦模式：琴弦列表 */
.hint {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 14px;
  text-align: center;
}

.strings {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.string-btn {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid var(--glass-border);
  border-left: 3px solid var(--color);
  border-radius: 12px;
  color: var(--text);
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: var(--glass-highlight), 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
  font-size: 1rem;
}

.string-btn:hover {
  background: rgba(255, 255, 255, 0.6);
  box-shadow: var(--glass-highlight), 0 2px 10px rgba(30, 41, 80, 0.12);
  transform: translateY(-1px);
}

.string-btn:active {
  transform: translateY(0) scale(0.99);
}

.string-btn.playing {
  background: rgba(255, 255, 255, 0.68);
  box-shadow: var(--glass-highlight), 0 2px 14px rgba(30, 41, 80, 0.16);
}

.string-num {
  font-size: 0.75rem;
  color: var(--text-dim);
  min-width: 30px;
}

.string-note {
  font-weight: 600;
  font-size: 1.05rem;
  flex: 1;
  color: var(--text);
}

.string-note sup {
  font-size: 0.7em;
  font-weight: 500;
  color: var(--text-dim);
}

.string-note sub {
  font-size: 0.65em;
  color: var(--text-dim);
}

.string-freq {
  font-size: 0.75rem;
  color: var(--text-dim);
  font-family: 'SF Mono', 'Cascadia Code', monospace;
}

/* 实时听音模式 */
.mic-area {
  text-align: center;
  margin-bottom: 18px;
}

.mic-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 12px 28px;
  background: rgba(255, 255, 255, 0.45);
  color: var(--text);
  border: 1px solid var(--glass-border);
  border-radius: 24px;
  font-size: 0.95rem;
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: var(--glass-highlight), 0 2px 8px rgba(30, 41, 80, 0.08);
  transition: all 0.2s;
}

.mic-btn:hover {
  background: rgba(255, 255, 255, 0.65);
  box-shadow: var(--glass-highlight), 0 3px 12px rgba(30, 41, 80, 0.14);
  transform: translateY(-1px);
}

.mic-btn:active {
  transform: translateY(0) scale(0.98);
}

.mic-btn.active {
  background: var(--primary);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 4px 16px rgba(0, 0, 0, 0.2);
}

.mic-icon {
  font-size: 1.1rem;
}

/* 识别结果显示 */
.detection {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.detected-note {
  text-align: center;
}

.note-name {
  font-size: 2.6rem;
  font-weight: 600;
  display: block;
  letter-spacing: -0.02em;
  color: var(--text);
}

.note-name sup {
  font-size: 0.55em;
  font-weight: 500;
  color: var(--text-dim);
}

.note-name sub {
  font-size: 0.5em;
  color: var(--text-dim);
}

.note-name.dim {
  color: #ccc;
}

.note-name.holding {
  opacity: 0.55;
}

.note-freq {
  font-size: 0.8rem;
  color: var(--text-dim);
  font-family: 'SF Mono', 'Cascadia Code', monospace;
  margin-top: 2px;
}

.hold-hint {
  display: block;
  font-size: 0.72rem;
  color: var(--text-dim);
  margin-top: 4px;
}

/* 音分表 */
.meter-wrap {
  position: relative;
}

.meter-track {
  position: relative;
  height: 32px;
  background: rgba(255, 255, 255, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 16px;
  overflow: hidden;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: inset 0 1px 4px rgba(30, 41, 80, 0.08);
}

.meter-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, #e8d5a3 0%, #9ccd9c 35%, #9ccd9c 65%, #e8d5a3 100%);
  border-radius: 16px;
  transition: width 0.2s ease;
}

.meter-center {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--text);
  transform: translateX(-50%);
  border-radius: 1px;
  opacity: 0.3;
}

.target-marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  transition: opacity 0.2s;
  z-index: 2;
}

.target-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  opacity: 0.3;
}

.target-marker.active .target-dot {
  opacity: 0.9;
}

.meter-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: var(--text-dim);
  margin-top: 4px;
}

.active-string-hint {
  color: var(--text);
  font-weight: 600;
}

.cents-value {
  text-align: center;
  margin-top: 6px;
  font-size: 1.05rem;
  font-weight: 600;
}

.cents-value .good {
  color: var(--good);
}

.cents-value .ok {
  color: var(--warn);
}

/* 各琴弦状态列表 */
.string-status-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.string-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  transition: all 0.15s;
  font-size: 0.85rem;
}

.string-row.active {
  background: var(--surface);
}

.string-row.dimmed {
  opacity: 0.35;
}

.s-num {
  min-width: 28px;
  color: var(--text-dim);
  font-size: 0.75rem;
}

.s-note {
  min-width: 36px;
  font-weight: 600;
  font-size: 0.85rem;
}

.s-note sup {
  font-size: 0.7em;
  color: var(--text-dim);
}

.s-note sub {
  font-size: 0.65em;
  color: var(--text-dim);
}

.s-bar-wrap {
  flex: 1;
  height: 5px;
  background: var(--surface);
  border-radius: 3px;
  overflow: hidden;
}

.s-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.2s;
}

.s-status {
  min-width: 40px;
  text-align: right;
  font-size: 0.75rem;
}

/* 占位提示 */
.placeholder {
  text-align: center;
  color: var(--text-dim);
  padding: 16px 0;
}

.placeholder .small {
  font-size: 0.8rem;
  margin-top: 4px;
  opacity: 0.7;
}

/* 页脚 */
.footer {
  text-align: center;
  font-size: 0.7rem;
  color: var(--text-dim);
  padding: 4px;
}
</style>
