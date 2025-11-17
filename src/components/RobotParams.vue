<script setup>
import { ref, computed } from 'vue'

// 机器人IP地址
const robotIp = ref('192.168.0.100')

// 上位机IP地址
const hostIp = ref('--')

// 上位机连接状态
const connectionStatus = ref(false)

// 巡线标志位状态
const lineFollowingStatus = ref(false)

// 连接状态文字
const connectionStatusText = computed(() => connectionStatus.value ? '已连接' : '未连接')

// 连接状态类型
const connectionStatusType = computed(() => connectionStatus.value ? 'success' : 'danger')

// 巡线状态文字
const lineFollowingStatusText = computed(() => lineFollowingStatus.value ? '巡线中' : '停  止')

// 巡线状态类型
const lineFollowingStatusType = computed(() => lineFollowingStatus.value ? 'success' : 'info')

// 徽章配色：与电池电量徽章一致的三档（ok/low/warn）
const connectionBadgeClass = computed(() => connectionStatus.value ? 'ok' : 'warn')
const lineBadgeClass = computed(() => lineFollowingStatus.value ? 'ok' : 'low')

// 更新连接状态
const updateConnectionStatus = (status) => {
  connectionStatus.value = status
}

// 更新上位机IP
const updateHostIp = (ip) => {
  hostIp.value = ip
}

// 更新巡线标志位
const updateLineFollowingStatus = (status) => {
  lineFollowingStatus.value = status
}

defineExpose({
  updateConnectionStatus,
  updateHostIp,
  updateLineFollowingStatus
})
</script>

<template>
  <el-card class="params-card">
    <template #header>
      <div class="card-header">
        <span>机器人参数</span>
      </div>
    </template>
    <div class="params-content">
      <div class="params-grid">
        <div class="param-row">
          <span class="param-label">机器人IP:</span>
          <span class="param-value">{{ robotIp }}</span>
        </div>
        <div class="param-row">
          <span class="param-label">上位机IP:</span>
          <span class="param-value">{{ hostIp }}</span>
        </div>
        <div class="param-row">
          <span class="param-label">连接状态:</span>
          <span class="status-badge" :class="connectionBadgeClass">{{ connectionStatusText }}</span>
        </div>
        <div class="param-row">
          <span class="param-label">巡线状态:</span>
          <span class="status-badge" :class="lineBadgeClass">{{ lineFollowingStatusText }}</span>
        </div>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.params-card {
  margin-top: 20px;  /* 与上方巡线速度卡片保持 20px 间距 */
  margin-bottom: 0;  /* 移除底部间距，避免与下方控制命令卡片间距过大 */
  background-color: var(--vt-c-black-soft);
  border: 1px solid var(--vt-c-black-mute);
  color: var(--vt-c-text-dark-1);
  height: auto; /* 确保卡片高度自适应内容 */
  flex: 0 0 auto; /* 在父 flex 列中不被压缩 */
}

.params-card :deep(.el-card__header) {
  border-bottom: 1px solid var(--vt-c-black-mute);
  padding: 10px 20px;
}

.params-card :deep(.el-card__body) {
  padding: 16px 20px;
  height: auto; /* 确保内容区域高度自适应 */
  overflow: visible; /* 确保内容不被裁剪 */
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.params-content {
  display: flex;
  flex-direction: column;
  width: 100%; /* 确保内容容器占满宽度 */
}

.params-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  width: 100%; /* 确保网格占满宽度 */
}

.param-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
  border: 1px solid var(--vt-c-black-mute);
  min-height: 36px; /* 确保每行有最小高度 */
}

.param-label {
  font-size: 13px;
  color: #aaa;
  font-weight: 500;
  white-space: nowrap;
  margin-right: 8px;
  flex-shrink: 0; /* 标签不收缩 */
}

.param-value {
  font-size: 13px;
  color: #ddd;
  font-weight: 500;
  font-family: 'Courier New', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1; /* 值占据剩余空间 */
  text-align: right; /* 值右对齐 */
}

.el-tag {
  font-weight: 500;
  font-size: 12px;
  flex-shrink: 0; /* 标签不收缩 */
}

/* 自定义徽章，配色与电池徽章一致 */
.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 10px;
  border-radius: 12px;
  line-height: 1.2;
  font-size: 12px;
  font-weight: 600;
  background: rgba(255,255,255,0.08);
  backdrop-filter: blur(2px);
  white-space: nowrap;
}
.status-badge.ok {
  color: #5cb87a;
  border: 1px solid #2f9e5f;
}
.status-badge.low {
  color: #e6a23c;
  border: 1px solid #e6a23c;
}
.status-badge.warn {
  color: #ff0000;
  border: 1px solid #ff4d4d;
}

/* 响应式：窄屏时恢复单列 */
@media (max-width: 720px) {
  .params-grid {
    grid-template-columns: 1fr;
  }
}
</style>
