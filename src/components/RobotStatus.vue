<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'

// 电池电压（V）
const batteryVoltage = ref(0)
// 厂家规则：20.1V -> 10%，23.0V 及以上 -> 100%，中间线性映射；低于 20.1V 仍显示 10%
const LOW_VOLTAGE_V = 20.1          // 百分比锚点：20.1V -> 10%
const RED_THRESHOLD_V = 20.15       // 变红阈值：电压低于 20.15V -> 红、需充电
const LOW_BATTERY_V = 21.0          // 黄档上限：≤21.0V -> 黄
const FULL_VOLTAGE_V = 23.0
const batteryGaugePercent = computed(() => {
  const v = Number(batteryVoltage.value)
  if (!isFinite(v)) return 0
  if (v >= FULL_VOLTAGE_V) return 100
  if (v <= LOW_VOLTAGE_V) return 10
  const t = (v - LOW_VOLTAGE_V) / (FULL_VOLTAGE_V - LOW_VOLTAGE_V)
  return Math.round(10 + t * (100 - 10))
})
const batteryHintText = computed(() => {
  const v = Number(batteryVoltage.value)
  if (!isFinite(v)) return '--'
  if (v < RED_THRESHOLD_V) return '需充电'
  if (v <= LOW_BATTERY_V) return '电量低'
  return '正常'
})
const batteryHintType = computed(() => {
  const v = Number(batteryVoltage.value)
  if (!isFinite(v)) return 'warn'
  if (v < RED_THRESHOLD_V) return 'warn'
  if (v <= LOW_BATTERY_V) return 'low'
  return 'ok'
})
// 环形进度条颜色与状态同步
const batteryColor = computed(() => {
  const v = Number(batteryVoltage.value)
  if (!isFinite(v)) return '#ff0000'
  if (v < RED_THRESHOLD_V) return '#ff0000'
  if (v <= LOW_BATTERY_V) return '#e6a23c'
  return '#5cb87a'
})
// 速度数据（线速度/角速度）
// 假设 /cmd_vel 发布频率 ~10Hz，可显示 5 秒窗口 => 50 个点
const SPEED_WINDOW_SECONDS = 10
const SPEED_EXPECTED_HZ = 10 // 如实际频率不同，可调整此值
const SPEED_MAX_POINTS = SPEED_WINDOW_SECONDS * SPEED_EXPECTED_HZ
const speedData = ref([])     // linear.x 最近窗口
const angData = ref([])       // angular.z 最近窗口

// 固定Y轴：防止数据变化导致坐标轴频繁跳变与横向网格线骤增
const SPEED_Y_MIN_FIXED = -1.5
const SPEED_Y_MAX_FIXED = 1.5
const SPEED_Y_INTERVAL_FIXED = 0.5
// 雷达数据
const radarData = ref({
  frontLeft: 0,
  frontRight: 0,
  backLeft: 0,
  backRight: 0
})
// 【改动】雷达历史数据记录,用于判断变化趋势(厘米),记录最近3帧
const radarHistoryCm = {
  frontLeft: [100, 100, 100],
  frontRight: [100, 100, 100],
  backLeft: [100, 100, 100],
  backRight: [100, 100, 100]
}

let speedChart = null
// 固定的y轴范围与分度（不随数据变化）
const getSpeedYAxis = () => ({
  min: SPEED_Y_MIN_FIXED,
  max: SPEED_Y_MAX_FIXED,
  interval: SPEED_Y_INTERVAL_FIXED
})

// 雷达距离映射：25~450 cm -> 0~100%
const RADAR_MIN = 25
const RADAR_MAX = 450
// 可视化策略：近距离阶段(危险)希望条形更容易被注意，而线性映射会让 25~35cm 仅占几个百分比过窄。
// 分级最小显示：根据距离提升最小百分比，让接近区域更醒目；仍保持总体 25~450 线性趋势。
const NEAR_STEPS = [
  { limit: RADAR_MIN, minPercent: 10 },      // ≤25cm 至少 10%
  { limit: RADAR_MIN + 5, minPercent: 15 },  // ≤30cm 至少 15%
  { limit: RADAR_MIN + 10, minPercent: 20 }, // ≤35cm 至少 20%
  { limit: RADAR_MIN + 15, minPercent: 25 }, // ≤40cm 至少 25%
  { limit: RADAR_MIN + 25, minPercent: 30 }, // ≤50cm 至少 30%
  { limit: RADAR_MIN + 35, minPercent: 35 }, // ≤60cm 至少 35%
  { limit: RADAR_MIN + 50, minPercent: 40 }, // ≤75cm 至少 40%
  { limit: RADAR_MIN + 75, minPercent: 45 }  // ≤100cm 至少 45%
]
const distanceToPercent = (cm) => {
  if (cm === null || cm === undefined || isNaN(cm)) return 0
  // 线性基础百分比
  const p = ((cm - RADAR_MIN) / (RADAR_MAX - RADAR_MIN)) * 100
  let basePercent = Math.max(0, Math.min(100, Math.round(p)))
  
  // 找到适用的最低百分比保护
  let minPercent = 0
  for (const step of NEAR_STEPS) {
    if (cm <= step.limit) {
      minPercent = step.minPercent
      break
    }
  }
  
  // 如果没有匹配到任何阶梯（距离超过所有阈值），使用最后一档的最小值
  if (minPercent === 0 && NEAR_STEPS.length > 0) {
    minPercent = NEAR_STEPS[NEAR_STEPS.length - 1].minPercent
  }
  
  // 取线性值与最小保护值的较大者，确保单调递增
  return Math.max(basePercent, minPercent)
}

// 颜色渐变：
// 0% -> 红 #f56c6c, 20% -> 黄 #e6a23c, 50% -> 黄 #e6a23c, 100% -> 绿 #67c23a
const HEX_TO_RGB = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 }
}
const RGB_TO_HEX = ({ r, g, b }) => {
  const toHex = (v) => v.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
const LERP_COLOR = (c1, c2, t) => {
  const a = HEX_TO_RGB(c1)
  const b = HEX_TO_RGB(c2)
  const mix = {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t)
  }
  return RGB_TO_HEX(mix)
}
// 雷达颜色渐变：根据实际距离(cm)而非百分比
// ≤25cm: 纯红, 25-50cm: 红→黄, 50-120cm: 黄→绿, ≥120cm: 纯绿
const radarColorGradient = (cm) => {
  // 如果传入的是通过 distanceToPercent 计算后的百分比，需要从实际距离调用
  // 但为了兼容现有调用方式，这里接收距离值(cm)
  if (cm === null || cm === undefined || isNaN(cm)) return '#ff0000'
  
  const redStrong = '#ff0000' // 纯红
  const yellow = '#e6a23c'    // 黄
  const green = '#67c23a'     // 绿
  
  // ≤25cm: 纯红
  if (cm <= 25) return redStrong
  
  // 25-50cm: 红 -> 黄 渐变
  if (cm <= 50) {
    const t = (cm - 25) / (50 - 25)
    return LERP_COLOR(redStrong, yellow, t)
  }
  
  // 50-120cm: 黄 -> 绿 渐变
  if (cm <= 120) {
    const t = (cm - 50) / (120 - 50)
    return LERP_COLOR(yellow, green, t)
  }
  
  // ≥120cm: 纯绿
  return green
}
// 显示格式：边界外用 < / >
const formatDistance = (cm) => {
  if (cm === null || cm === undefined || isNaN(cm)) return '--'
  if (cm < RADAR_MIN) return `<${RADAR_MIN}cm`
  if (cm > RADAR_MAX) return `>${RADAR_MAX}cm`
  return `${Math.round(cm)}cm`
}

// 初始化速度图表（添加非过冲移动平均平滑）
const initSpeedChart = (chartDom) => {
  speedChart = echarts.init(chartDom)
  const yAxisOpt = getSpeedYAxis()
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      formatter: (params) => {
        const idx = params?.[0]?.dataIndex ?? 0
        const vxRaw = speedData.value[idx]
        const wzRaw = angData.value[idx]
        const vxSm = params.find(p => p.seriesName === '线速度')?.data
        const wzSm = params.find(p => p.seriesName === '角速度')?.data
        const fmt = (v) => (typeof v === 'number' && isFinite(v) ? v.toFixed(3) : '--')
        return [
          `线速度: ${fmt(vxRaw)} m/s`,
          `角速度: ${fmt(wzRaw)} rad/s`
        ].join('<br/>')
      }
    },
    grid: {
      top: 12,
      right: 20,
      bottom: 12,
      left: 40
    },
    xAxis: {
      type: 'category',
      data: Array(SPEED_MAX_POINTS).fill(''),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#666' } },
      splitLine: { lineStyle: { color: '#333' } },
      min: yAxisOpt.min,
      max: yAxisOpt.max,
      interval: yAxisOpt.interval
    },
    series: [
      {
        name: '线速度',
        data: Array(SPEED_MAX_POINTS).fill(0),
        type: 'line',
        smooth: false, // 禁用样条，避免过冲
        symbol: 'none',
        clip: true,
        color: '#41b883'
      },
      {
        name: '角速度',
        data: Array(SPEED_MAX_POINTS).fill(0),
        type: 'line',
        smooth: false,
        symbol: 'none',
        clip: true,
        color: '#409EFF'
      }
    ]
  }
  speedChart.setOption(option)
}

// 简单移动平均平滑（不会超过原始极值范围）
const movingAverage = (arr, w) => {
  const out = []
  let sum = 0
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i]
    if (i >= w) sum -= arr[i - w]
    const count = i + 1 < w ? i + 1 : w
    out.push(sum / count)
  }
  return out
}

// 更新速度图表数据（线速度）
const updateSpeedChart = (newSpeed) => {
  if (!speedChart) return
  const v = Number(newSpeed)
  if (!Number.isFinite(v)) return
  speedData.value.push(v)
  if (speedData.value.length > SPEED_MAX_POINTS) speedData.value.shift()
  const speedSmooth = movingAverage(speedData.value, 5)
  const angSmooth = movingAverage(angData.value, 5)
  // 绘图前做显示层钳制，避免视觉越界（不改变原始数据）
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
  const speedDraw = speedSmooth.map(x => clamp(x, SPEED_Y_MIN_FIXED, SPEED_Y_MAX_FIXED))
  const angDraw = angSmooth.map(x => clamp(x, SPEED_Y_MIN_FIXED, SPEED_Y_MAX_FIXED))
  const xlen = Math.max(speedSmooth.length, angSmooth.length)
  speedChart.setOption({
    xAxis: { data: Array(xlen).fill('') },
    series: [
      { name: '线速度', data: speedDraw },
      { name: '角速度', data: angDraw }
    ]
  })
}

// 更新角速度曲线（angular.z）
const updateAngularChart = (wz) => {
  if (!speedChart) return
  const w = Number(wz)
  if (!Number.isFinite(w)) return
  angData.value.push(w)
  if (angData.value.length > SPEED_MAX_POINTS) angData.value.shift()
  const speedSmooth = movingAverage(speedData.value, 5)
  const angSmooth = movingAverage(angData.value, 5)
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
  const speedDraw = speedSmooth.map(x => clamp(x, SPEED_Y_MIN_FIXED, SPEED_Y_MAX_FIXED))
  const angDraw = angSmooth.map(x => clamp(x, SPEED_Y_MIN_FIXED, SPEED_Y_MAX_FIXED))
  const xlen = Math.max(speedSmooth.length, angSmooth.length)
  speedChart.setOption({
    xAxis: { data: Array(xlen).fill('') },
    series: [
      { name: '线速度', data: speedDraw },
      { name: '角速度', data: angDraw }
    ]
  })
}

// 更新雷达数据
const updateRadarInfo = (fl, fr, bl, br) => {
  // RosCommunication 传入的是米(m)，需要转换为厘米(cm)
  // 【改动】处理 0 值歧义：默认显示超出上限，只有下降趋势时显示低于下限
  // 通信协议：>450cm 或 <25cm 都返回 0
  // 策略：分析最近3帧数据的变化趋势
  // - 默认：0 → 超出上限 450cm
  // - 仅当呈下降趋势(从大变小)然后变0 → 低于下限 25cm
  const MAX_CM = 450       // 上限
  const MIN_CM = 25        // 下限
  
  const processZeroWithTrend = (currentM, history) => {
    const currentCm = currentM * 100
    if (currentCm !== 0) return currentCm
    
    // current === 0，分析历史趋势
    // history 是最近3帧: [最早, 较早, 最近]
    const validHistory = history.filter(v => v > 0)
    
    // 【改动】默认返回上限，只有明确下降趋势时才返回下限
    if (validHistory.length < 2) {
      // 历史数据不足，默认超出上限
      return MAX_CM
    }
    
    // 计算趋势：比较最近两个有效值
    const last = validHistory[validHistory.length - 1]
    const prev = validHistory[validHistory.length - 2]
    
    // 【改动】只有下降趋势才判定为低于下限，其他情况都是超出上限
    return last < prev ? MIN_CM : MAX_CM
  }
  
  const flCm = processZeroWithTrend(fl, radarHistoryCm.frontLeft)
  const frCm = processZeroWithTrend(fr, radarHistoryCm.frontRight)
  const blCm = processZeroWithTrend(bl, radarHistoryCm.backLeft)
  const brCm = processZeroWithTrend(br, radarHistoryCm.backRight)
  
  // 【改动】更新历史记录：移除最早的，添加当前处理后的值
  radarHistoryCm.frontLeft.shift()
  radarHistoryCm.frontLeft.push(flCm)
  radarHistoryCm.frontRight.shift()
  radarHistoryCm.frontRight.push(frCm)
  radarHistoryCm.backLeft.shift()
  radarHistoryCm.backLeft.push(blCm)
  radarHistoryCm.backRight.shift()
  radarHistoryCm.backRight.push(brCm)
  
  radarData.value = {
    frontLeft: flCm,
    frontRight: frCm,
    backLeft: blCm,
    backRight: brCm
  }
  //console.log('Radar data updated (cm):', radarData.value)
}

// 监听窗口大小变化
const handleResize = () => {
  speedChart?.resize()
}

onMounted(() => {
  const chartDom = document.getElementById('speedChart')
  if (chartDom) {
    initSpeedChart(chartDom)
  }
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  speedChart?.dispose()
})

// 外部调用：更新电压
const updateBatteryVoltage = (voltage) => {
  if (voltage === null || voltage === undefined || isNaN(voltage)) return
  batteryVoltage.value = voltage
}

defineExpose({
  updateRadarInfo,
  updateSpeedChart,
  updateBatteryVoltage,
  updateAngularChart
})
</script>

<template>
  <div class="robot-status">
    <!-- 第一行：电池（左） + 雷达（右） -->
    <div class="status-first-row">
      <div class="battery-wrapper">
        <el-card class="status-card battery-card">
          <div class="battery-status">
            <el-progress
              type="dashboard"
              :percentage="batteryGaugePercent"
              :color="batteryColor"
            >
              <template #default>
                <div class="battery-text">
                  <i class="el-icon-battery" style="font-size: 20px"></i>
                  <span>{{ batteryVoltage.toFixed(1) }} V</span>
                  <small :class="['battery-hint', batteryHintType]">{{ batteryHintText }}</small>
                </div>
              </template>
            </el-progress>
          </div>
        </el-card>
      </div>

      <div class="radar-wrapper">
        <el-card class="status-card radar-card">
          <div class="radar-progress-list">
            <div class="sensor-progress">
              <label class="sensor-inline">
                <span class="sensor-name">左前雷达</span>
                <el-progress
                  :text-inside="true"
                  :stroke-width="16"
                  :color="radarColorGradient(radarData.backLeft)"
                  :percentage="distanceToPercent(radarData.backLeft)"
                >
                  <span>{{ formatDistance(radarData.backLeft) }}</span>
                </el-progress>
              </label>
            </div>
            <div class="sensor-progress">
              <label class="sensor-inline">
                <span class="sensor-name">右前雷达</span>
                <el-progress
                  :text-inside="true"
                  :stroke-width="16"
                  :color="radarColorGradient(radarData.backRight)"
                  :percentage="distanceToPercent(radarData.backRight)"
                >
                  <span>{{ formatDistance(radarData.backRight) }}</span>
                </el-progress>
              </label>
            </div>
            <div class="sensor-progress">
              <label class="sensor-inline">
                <span class="sensor-name">左后雷达</span>
                <el-progress
                  :text-inside="true"
                  :stroke-width="16"
                  :color="radarColorGradient(radarData.frontLeft)"
                  :percentage="distanceToPercent(radarData.frontLeft)"
                >
                  <span>{{ formatDistance(radarData.frontLeft) }}</span>
                </el-progress>
              </label>
            </div>
            <div class="sensor-progress">
              <label class="sensor-inline">
                <span class="sensor-name">右后雷达</span>
                <el-progress
                  :text-inside="true"
                  :stroke-width="16"
                  :color="radarColorGradient(radarData.frontRight)"
                  :percentage="distanceToPercent(radarData.frontRight)"
                >
                  <span>{{ formatDistance(radarData.frontRight) }}</span>
                </el-progress>
              </label>
            </div>
          </div>
        </el-card>
      </div>
    </div>

    <!-- 第二行：速度曲线（全宽） -->
    <el-row :gutter="20" class="second-row">
      <el-col :span="24">
        <el-card class="status-card">
          <template #header>
            <div class="card-header">
              <span>巡线速度</span>
            </div>
          </template>
          <div id="speedChart" class="speed-chart"></div>
          <div class="speed-legend">
            <div class="legend-item">
              <span class="legend-color legend-linear"></span>
              <span class="legend-text">线速度 (m/s)</span>
            </div>
            <div class="legend-item">
              <span class="legend-color legend-angular"></span>
              <span class="legend-text">角速度 (rad/s)</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.robot-status {
  width: 100%;
  /* 让容器根据内容自适应，不再强制占满父高度，避免底部出现空白 */
  height: auto;
  /* 允许子项在窄屏时收缩，避免出现额外的滚动条 */
  overflow: visible;
  box-sizing: border-box;
  margin-bottom: 0; /* 不增加额外间距 */
  padding-bottom: 0; /* 移除可能导致额外空间的内边距 */
}

.status-card {
  margin-bottom: 20px;
  background-color: var(--vt-c-black-soft);
  border: 1px solid var(--vt-c-black-mute);
  color: var(--vt-c-text-dark-1);
}

.status-card:last-child {
  margin-bottom: 0; /* 最后一个卡片不需要底部间距 */
}

/* 速度曲线卡片下方额外空白的常见原因是其内部元素设置了固定高度，这里保持内部元素紧凑 */
.second-row {
  margin-top: 20px; /* 与上方第一行卡片保持 20px 间距 */
  padding-bottom: 0; /* 防止产生额外底部空白 */
}

.battery-card {
  aspect-ratio: 1;
  width: 200px !important;
  height: auto;
  display: flex;
  flex-direction: column;
  margin: 0 auto;  /* 在列中居中显示 */
}

.radar-card {
  height: 200px !important; /* 固定高度与电池卡片一致 */
}

.radar-card :deep(.el-card__body) {
  height: 100%;
  padding: 12px 16px; /* 增加左右padding */
  overflow: hidden;
}

.battery-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  padding: 0;
  align-items: center;
  justify-content: center;
}

.status-card :deep(.el-card__header) {
  border-bottom: 1px solid var(--vt-c-black-mute);
  padding: 10px 20px;
}

.battery-status {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
}

.battery-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  
  /* 电池图标样式 */
  i {
    font-size: 30px;
    color: var(--el-color-primary);
  }
  
  /* 百分比文字样式 */
  span {
    font-size: 26px;
    font-weight: 500;
    line-height: 1;
    color: #fff; /* 电压数值与单位改为纯白 */
  }
  .battery-hint {
    font-size: 14px;
    font-weight: 500;
    padding: 2px 10px;
    border-radius: 12px;
    line-height: 1.2;
    background: rgba(255,255,255,0.08);
    backdrop-filter: blur(2px);
    margin-top: 8px; /* 增大与电压数值之间的间距 */
  }
  .battery-hint.ok {
    color: #5cb87a;
    border: 1px solid #2f9e5f;
  }
  .battery-hint.low {
    color: #e6a23c;
    border: 1px solid #e6a23c;
    /* 低电量：弱呼吸动画 */
    animation: lowPulse 2.0s ease-in-out infinite;
    box-shadow: 0 0 0 0 rgba(230,162,60,0.35);
  }
  .battery-hint.warn {
    color: #ff0000;
    border: 1px solid #ff4d4d;
    /* 与低电量一致的呼吸效果，仅加快速度；其他强度与光晕保持一致（红色基调） */
    animation: lowPulseRed 1.0s ease-in-out infinite;
    box-shadow: 0 0 0 0 rgba(255,77,77,0.35);
  }
}

@keyframes hintPulse {
  0% { filter: brightness(1); }
  50% { filter: brightness(1.35); }
  100% { filter: brightness(1); }
}
/* 不再需要单独 warnPulse，warn 使用 lowPulse 更快的节奏 */
@keyframes lowPulse {
  0% {
    filter: brightness(1);
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(230,162,60,0.35);
  }
  50% {
    filter: brightness(1.20); /* 从 1.15 提升到 1.30 更醒目 */
    transform: scale(1.06);   /* 轻微缩放产生“呼吸”感 */
    box-shadow: 0 0 12px 4px rgba(230,162,60,0.5);
  }
  100% {
    filter: brightness(1);
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(230,162,60,0.35);
  }
}

/* 与 lowPulse 参数一致，但使用红色光晕，供“需充电”使用 */
@keyframes lowPulseRed {
  0% {
    filter: brightness(1);
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255,77,77,0.35);
  }
  50% {
    filter: brightness(1.20);
    transform: scale(1.06);
    box-shadow: 0 0 12px 4px rgba(255,77,77,0.5);
  }
  100% {
    filter: brightness(1);
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255,77,77,0.35);
  }
}

.speed-chart {
  height: 200px;
  width: 100%;
  box-sizing: border-box;
  padding: 0 !important;
}

.speed-legend {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center; /* 居中注释区域 */
  gap: 12px;
  font-size: 12px;
  color: #aaa;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend-color {
  width: 14px;
  height: 4px;
  border-radius: 2px;
  display: inline-block;
}
.legend-linear { background: #41b883; }
.legend-angular { background: #409EFF; }
.legend-text { color: #ddd; }
/* 已去除备注文字 */

/* 仅影响速度曲线卡片的内容区 padding，不影响其他卡片 */
.second-row :deep(.el-card__body) {
  padding: 4px 8px !important; /* 减小顶部间距 */
}

/* 仅影响速度曲线卡片的标题区 padding，进一步拉近与图表的距离 */
.second-row :deep(.el-card__header) {
  padding: 6px 12px !important;
}

.radar-info {
  padding: 10px;
}

.radar-item {
  margin: 10px 0;
  padding: 10px;
  background-color: var(--vt-c-black-mute);
  border-radius: 4px;
  text-align: center;
}

/* 新的雷达进度条垂直列表 */
.radar-progress-list {
  display: flex;
  flex-direction: column;
  justify-content: space-evenly; /* 均匀分布四个进度条 */
  height: 100%;
  gap: 0;
  padding: 0;
}

.sensor-progress {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.sensor-inline {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 12px;
}
.sensor-inline .sensor-name {
  flex: 0 0 auto; /* 标签自适应宽度 */
  min-width: 64px; /* 最小宽度容纳4个汉字 */
  font-size: 13px;
  color: var(--vt-c-text-dark-1);
  letter-spacing: 0.5px;
  text-align: left; /* 改为左对齐 */
}

/* line 类型进度条填满容器 */
.sensor-inline :deep(.el-progress--line) {
  width: 100%;
  margin: 0; /* 去掉默认底部 margin */
}

/* 内嵌文字样式提升对比度 */
.sensor-inline :deep(.el-progress__text) {
  font-size: 13px;
  font-weight: 500;
  color: #fff; /* 红色背景上用白色文字 */
}

/* text-inside 模式下真实的文字容器，确保垂直居中 */
.sensor-inline :deep(.el-progress-bar__innerText) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  line-height: 1; /* 避免额外行高偏移 */
}

/* 电池圆形进度条样式 - 限定只作用于电池卡片 */
.battery-card :deep(.el-progress) {
  width: 150px;
  height: 150px;
  display: flex;
  justify-content: center;
  align-items: center;
  
  .el-progress-circle {
    width: 150px !important;
    height: 150px !important;
  }
  
  .el-progress__text {
    position: absolute;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

/* 新增：第一行容器改为 flex，保证两块卡片并列且有 20px 间距，不会互相覆盖 */
.status-first-row {
  display: flex;
  align-items: flex-start;  /* 改为顶部对齐，不拉伸高度 */
  gap: 20px;            /* 二者间距 20px */
  width: 100%;
  box-sizing: border-box;
}

/* 第二行与第一行之间的垂直间距 20px */
.second-row {
  margin-top: 20px;
}

/* 电量卡片固定宽度 200px，禁止缩放以避免被压扁 */
.battery-wrapper {
  flex: 0 0 200px;      /* 固定宽度 */
  min-width: 200px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 雷达卡片占用剩余空间，可收缩但不会压到电量卡片 */
.radar-wrapper {
  flex: 1 1 0;          /* 占据剩余空间，可缩放 */
  min-width: 0;         /* 允许在 flex 容器内收缩，避免横向溢出 */
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;  /* 雷达卡片不拉伸高度 */
}

/* 确保内部卡片不产生额外外边距导致溢出 */
.battery-wrapper .el-card,
.radar-wrapper .el-card {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

/* 兼容窄屏：当宽度不足时堆叠显示 */
@media (max-width: 720px) {
  .status-first-row {
    flex-direction: column;
    gap: 12px;
  }

  .battery-wrapper {
    flex: 0 0 auto;
    min-width: 0;
    width: 100%;
  }

  .radar-wrapper {
    width: 100%;
  }
}

/* Small screens: stack battery and radar vertically to avoid overlap */
@media (max-width: 800px) {
  .first-row .el-col {
    flex: 0 0 100% !important;
    max-width: 100% !important;
  }
  .robot-status {
    padding-right: 8px; /* reduce potential horizontal overflow from gutters */
  }
}
</style>