<script setup>
import { ref, reactive, computed, onUnmounted, watch } from 'vue'

// ─── Tuning Presets ─────────────────────────────────────────────
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

// Parse note name like "E2", "F#3" etc. to frequency
function noteToFreq(note) {
  return NOTE_TO_FREQ[note] || 0
}

// Parse note name into display parts: "F#3" → { letter: 'F', acc: '♯', octave: '3' }
function parseNote(raw) {
  const m = raw.match(/^([A-G])([#b])(\d)$/)
  if (m) {
    return { letter: m[1], acc: m[2] === '#' ? '♯' : '♭', octave: m[3] }
  }
  const m2 = raw.match(/^([A-G])(\d)$/)
  if (m2) {
    return { letter: m2[1], acc: '', octave: m2[2] }
  }
  return { letter: raw, acc: '', octave: '' }
}

const parsedNotes = computed(() => tuning.value.notes.map(parseNote))

// Detected note display
const detectedDisplay = computed(() => {
  if (!detected.name || detected.name === '--') return { letter: '--', acc: '', octave: '' }
  return parseNote(detected.name)
})

// Convert frequency to MIDI number
function freqToMidi(freq) {
  return 12 * (Math.log2(freq) - Math.log2(440)) + 69
}

// Convert frequency to closest note name with cents
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

// ─── State ──────────────────────────────────────────────────────
const tuningIndex = ref(0)
const mode = ref('listen') // 'listen' | 'reference'
const activeString = ref(-1)
const isListening = ref(false)
const detected = reactive({ name: '--', cents: 0, freq: 0, confidence: 0 })
const playingString = ref(-1)

// Keep the last detected note on screen briefly after the sound stops,
// so the player has time to read it before the display resets.
const HOLD_DURATION = 2500 // ms
const holding = ref(false)
let hasDetected = false
let lastDetectionTime = 0

const tuning = computed(() => TUNINGS[tuningIndex.value])
const targetFreqs = computed(() => tuning.value.notes.map(noteToFreq))

// ─── Audio state ────────────────────────────────────────────────
let audioCtx = null
let currentSource = null
let analyser = null
let mediaStream = null
let animationId = null
let micSource = null

// ─── Pitch detection (autocorrelation) ──────────────────────────
function autoCorrelate(buffer, sampleRate) {
  // RMS check
  let rms = 0
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i]
  rms = Math.sqrt(rms / buffer.length)
  if (rms < 0.005) return -1

  const size = buffer.length
  const minPeriod = Math.floor(sampleRate / 1600) // ~1600Hz max
  const maxPeriod = Math.floor(sampleRate / 30)   // ~30Hz min for guitar

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

  if (bestCorr < 0.1 || bestPeriod === 0) return -1

  // Parabolic interpolation for better accuracy
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

// ─── Audio processing loop ──────────────────────────────────────
function processAudio() {
  if (!analyser) return

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

    // Find closest target string
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
    // Only activate if within ~2 semitones
    if (closest >= 0 && minDiff < targetFreqs.value[closest] * 0.12) {
      activeString.value = closest
    } else {
      activeString.value = -1
    }
  } else {
    // No valid pitch this frame. Hold the last result for a moment
    // instead of immediately clearing it, so the reading stays visible.
    if (hasDetected && performance.now() - lastDetectionTime < HOLD_DURATION) {
      holding.value = true
      detected.confidence = 0.6 // slightly dimmed to show it's no longer live
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

  animationId = requestAnimationFrame(processAudio)
}

// ─── Start microphone ──────────────────────────────────────────
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
}

// ─── Karplus-Strong plucked string synthesis ────────────────────
// Physical modeling of a plucked string: noise burst excites a
// feedback delay line with a low-pass filter, producing a rich,
// guitar-like tone with natural harmonics and decay.
function synthesizeString(audioCtx, freq, duration) {
  const sampleRate = audioCtx.sampleRate
  const period = Math.round(sampleRate / freq)
  const totalSamples = Math.ceil(sampleRate * duration)

  const buffer = audioCtx.createBuffer(1, totalSamples, sampleRate)
  const data = buffer.getChannelData(0)

  // ── Excitation: shaped noise burst with exponential decay ──
  // This simulates the initial string pluck with a pick
  const exciterLen = Math.min(period, Math.ceil(sampleRate * 0.008))
  for (let i = 0; i < exciterLen; i++) {
    // Triangle-shaped amplitude envelope on white noise
    const env = 1 - i / exciterLen
    data[i] = (Math.random() * 2 - 1) * 0.6 * env * env
  }

  // ── Karplus-Strong delay line with low-pass damping ──────────
  // damping: 0.998 gives a long ring (~3s for guitar), 0.99 dies faster
  // brightness: controls LP filter cutoff (higher = brighter)
  // For low strings, slightly less damping to compensate for physical decay
  const brightness = 0.4 + 0.6 * (freq / 440) // brighter for higher notes
  const damping = 0.997 + 0.0015 * (freq / 440) // longer sustain for low notes

  for (let i = period; i < totalSamples; i++) {
    // Two-point moving average as low-pass filter in the feedback path
    const delayed = data[i - period]
    const delayedPrev = i - period - 1 >= 0 ? data[i - period - 1] : delayed
    // Blend: weighted average between delayed sample and its neighbor
    // This acts as a simple 1st-order low-pass on the feedback
    const blended = brightness * delayed + (1 - brightness) * delayedPrev
    data[i] = blended * damping
  }

  // ── Gentle fade-out to avoid click ───────────────────────────
  const fadeStart = totalSamples - Math.ceil(sampleRate * 0.05)
  for (let i = Math.max(0, fadeStart); i < totalSamples; i++) {
    const fadeProgress = (i - fadeStart) / (totalSamples - fadeStart)
    data[i] *= 1 - fadeProgress
  }

  return buffer
}

// ─── Play reference tone ────────────────────────────────────────
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

  // Synthesize the plucked string sound
  const duration = 3.0 // 3-second ring with natural decay
  const buffer = synthesizeString(audioCtx, freq, duration)

  const source = audioCtx.createBufferSource()
  source.buffer = buffer

  const gainNode = audioCtx.createGain()
  // Mild gain envelope: quick attack, then let the buffer's natural
  // decay handle the rest
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

// ─── Toggle mode ────────────────────────────────────────────────
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

// ─── Cleanup ────────────────────────────────────────────────────
onUnmounted(() => {
  stopListening()
  stopReference()
  if (audioCtx) {
    audioCtx.close()
    audioCtx = null
  }
})

// Watch: auto-start listen when component mounts is not done automatically
// Let the user start it manually via the toggle

// ─── Helpers ────────────────────────────────────────────────────
function formatCents(cents) {
  if (cents === 0) return '±0¢'
  return cents > 0 ? `+${cents}¢` : `${cents}¢`
}

function centsOffset(cents) {
  // Normalize to -50..50 range
  let c = cents
  while (c > 50) c -= 100
  while (c < -50) c += 100
  return c
}

function centsToPercent(cents) {
  // -50 => 0%, 0 => 50%, +50 => 100%
  return 50 + centsOffset(cents) * 0.5
}

const stringColors = ['var(--lo-e)', 'var(--a)', 'var(--d)', 'var(--g)', 'var(--b)', 'var(--hi-e)']
</script>

<template>
  <div class="tuner">
    <header class="header">
      <h1 class="title">🎸 吉他调音器</h1>
    </header>

    <!-- Tuning selector -->
    <section class="section">
      <label class="label">调弦选择</label>
      <select v-model.number="tuningIndex" class="select">
        <option v-for="(t, i) in TUNINGS" :key="i" :value="i">
          {{ t.label }}
        </option>
      </select>
    </section>

    <!-- Mode toggle -->
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

    <!-- Reference mode -->
    <template v-if="mode === 'reference'">
      <section class="section">
        <p class="hint">点击琴弦播放标准音，对照调弦</p>
        <div class="strings">
          <button
            v-for="(pn, i) in parsedNotes"
            :key="i"
            :class="['string-btn', { playing: playingString === i }]"
            :style="{ '--color': stringColors[i] }"
            @click="playReference(i)"
          >
            <span class="string-num">{{ STRING_NAMES[i] }}</span>
            <span class="string-note">
              {{ pn.letter }}<sup v-if="pn.acc">{{ pn.acc }}</sup><sub>{{ pn.octave }}</sub>
            </span>
            <span class="string-freq">{{ targetFreqs[i].toFixed(1) }}Hz</span>
          </button>
        </div>
      </section>
    </template>

    <!-- Listen mode -->
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

        <!-- Detection display -->
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

          <!-- Cents meter -->
          <div class="meter-wrap">
            <div class="meter-track">
              <div class="meter-fill" :style="{ width: centsToPercent(detected.cents) + '%' }"></div>
              <div class="meter-center"></div>
              <!-- Target markers -->
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
            <div class="cents-value" v-if="detected.cents">
              <span :class="{ good: Math.abs(centsOffset(detected.cents)) < 5, ok: Math.abs(centsOffset(detected.cents)) < 15 }">
                {{ formatCents(centsOffset(detected.cents)) }}
              </span>
            </div>
          </div>

          <!-- All strings status -->
          <div class="string-status-list">
            <div
              v-for="(note, i) in tuning.notes"
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
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 18px;
}

.label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-dim);
  margin-bottom: 8px;
}

.select {
  width: 100%;
  padding: 10px 14px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.95rem;
  appearance: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23999' d='M6 8L0 0h12z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
}

.select:focus {
  outline: none;
  border-color: var(--accent);
}

/* Mode tabs */
.mode-tabs {
  display: flex;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.mode-tab {
  flex: 1;
  padding: 10px 0;
  background: var(--card);
  color: var(--text-dim);
  border: none;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.15s;
}

.mode-tab + .mode-tab {
  border-left: 1px solid var(--border);
}

.mode-tab.active {
  background: var(--primary);
  color: #fff;
}

.mode-tab:hover:not(.active) {
  background: var(--surface);
}

/* Reference mode strings */
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
  background: var(--card);
  border: 1px solid var(--border);
  border-left: 3px solid var(--color);
  border-radius: 6px;
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  font-size: 1rem;
}

.string-btn:hover {
  background: #fafafa;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.string-btn.playing {
  background: #f0f0f8;
  box-shadow: 0 1px 8px rgba(0,0,0,0.1);
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

/* Listen mode */
.mic-area {
  text-align: center;
  margin-bottom: 18px;
}

.mic-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 12px 28px;
  background: var(--card);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 24px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
}

.mic-btn:hover {
  border-color: var(--accent);
}

.mic-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.mic-icon {
  font-size: 1.1rem;
}

/* Detection display */
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

/* Cents meter */
.meter-wrap {
  position: relative;
}

.meter-track {
  position: relative;
  height: 32px;
  background: var(--surface);
  border-radius: 16px;
  overflow: hidden;
}

.meter-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, #e8d5a3 0%, #9ccd9c 35%, #9ccd9c 65%, #e8d5a3 100%);
  border-radius: 16px;
  transition: width 0.08s ease;
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

/* Strings status list */
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
  transition: width 0.08s;
}

.s-status {
  min-width: 40px;
  text-align: right;
  font-size: 0.75rem;
}

/* Placeholder */
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

/* Footer */
.footer {
  text-align: center;
  font-size: 0.7rem;
  color: var(--text-dim);
  padding: 4px;
}
</style>
