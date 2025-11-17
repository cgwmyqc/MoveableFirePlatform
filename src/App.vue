<script setup>
import Header from './components/Header.vue'
import ModleDisplay from './components/ModleDisplay.vue'
import RosCommunication from './components/RosCommunication.vue'
import RobotControl from './components/RobotControl.vue'
import RobotStatus from './components/RobotStatus.vue'
import RobotParams from './components/RobotParams.vue'
import { ref } from 'vue'

// 创建ref用于保存ModleDisplay和RobotStatus的updateRadar方法
const updateRadarRef = ref(null)
const robotStatusRef = ref(null)
const robotParamsRef = ref(null)
// 电压更新函数引用
const updateVoltageCombined = ref((voltage) => {
  if (robotStatusRef.value?.updateBatteryVoltage) {
    robotStatusRef.value.updateBatteryVoltage(voltage)
  }
})

// 速度更新函数引用（订阅 /cmd_vel 的 linear.x）
const updateSpeedCombined = ref((vx) => {
  if (robotStatusRef.value?.updateSpeedChart) {
    // 直接推入速度曲线，后续可在此处做滤波/限幅
    robotStatusRef.value.updateSpeedChart(vx)
  }
})

// 角速度更新函数引用（订阅 /cmd_vel 的 angular.z）
const updateAngularCombined = ref((wz) => {
  if (robotStatusRef.value?.updateAngularChart) {
    robotStatusRef.value.updateAngularChart(wz)
  }
})

// 连接状态更新函数引用
const updateConnectionStatusCombined = ref((status) => {
  if (robotParamsRef.value?.updateConnectionStatus) {
    robotParamsRef.value.updateConnectionStatus(status)
  }
})

// 上位机IP更新函数引用
const updateHostIpCombined = ref((ip) => {
  if (robotParamsRef.value?.updateHostIp) {
    robotParamsRef.value.updateHostIp(ip)
  }
})

// 巡线状态更新函数引用
const updateLineFollowingStatusCombined = ref((status) => {
  if (robotParamsRef.value?.updateLineFollowingStatus) {
    robotParamsRef.value.updateLineFollowingStatus(status)
  }
})

function setUpdateRadar(fn) {
  updateRadarRef.value = fn
}

// 组合两个更新函数
const updateRadarCombined = ref((fl, fr, bl, br) => {
  // 更新ModleDisplay
  if (updateRadarRef.value) {
    updateRadarRef.value(fl, fr, bl, br)
  }
  // 更新RobotStatus
  if (robotStatusRef.value?.updateRadarInfo) {
    robotStatusRef.value.updateRadarInfo(fl, fr, bl, br)
  }
})
</script>

<template>
  <div class="common-layout">
    <el-container>
      <Header />
      <el-main>
        <div class="main-content">
          <ModleDisplay v-bind="{ setUpdateRadar }" />
          <div class="robot-panel">
            <RobotStatus ref="robotStatusRef" />
            <RobotParams ref="robotParamsRef" />
            <RobotControl />
          </div>
          <RosCommunication 
            :updateRadar="updateRadarCombined" 
            :updateVoltage="updateVoltageCombined" 
            :updateSpeed="updateSpeedCombined" 
            :updateAngular="updateAngularCombined"
            :updateConnectionStatus="updateConnectionStatusCombined"
            :updateHostIp="updateHostIpCombined"
            :updateLineFollowingStatus="updateLineFollowingStatusCombined"
          />
        </div>
      </el-main>
      <el-footer>
        <div class="footer-inner">
          <span class="footer-text">应急管理部沈阳消防研究所</span>
          <span class="footer-sep">·</span>
          <span class="footer-text">哈工大郑州研究院</span>
        </div>
      </el-footer>
    </el-container>
  </div>
</template>

<style>
@import './base.css';

#app {
  width: 100%;
  min-height: 100vh; /* 改为最小高度，允许内容超出时滚动 */
}

.common-layout {
  min-height: 100%; /* 改为最小高度 */
}

.el-container {
  min-height: 100vh; /* 改为最小高度，允许整体滚动 */
  background-color: var(--vt-c-black);
  display: flex;
  flex-direction: column;
}

.el-main {
  flex: 1 0 auto; /* 允许内容自然增长，不固定高度 */
  background-color: var(--vt-c-black);
  color: var(--vt-c-text-dark-1);
  padding: 20px;
}

.main-content {
  display: flex;
  min-height: 600px; /* 设置最小高度,确保 3D 模型可见 */
  flex: 1; /* 占据剩余空间 */
  /* allow children to wrap on narrow screens to avoid overlap */
  flex-wrap: wrap;
  gap: 16px;
}

/* 自定义滚动条样式（深色主题简约风格） */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  transition: background 0.3s;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

/* Firefox 滚动条样式 */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) rgba(0, 0, 0, 0.2);
}

/* 全局卡片样式增强：增加透明度和悬浮效果 */
.el-card {
  background-color: rgba(29, 30, 31, 0.8) !important;
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.el-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.robot-panel {
  /* prefer ~40% width but allow shrink/grow */
  flex: 1 1 40%;
  margin-left: 20px;
  display: flex;
  flex-direction: column;
  /* 消除内部组件之间出现超过 20px 的额外间距 */
  gap: 0;
  min-width: 280px;
}
/* Allow flex children to shrink on small viewports to prevent horizontal scrollbar */
.main-content > *:not(.robot-panel) {
  min-width: 0;
  flex: 1 1 55%; /* ModleDisplay 占据约 55% 宽度 */
  min-height: 500px; /* 确保 3D 模型有足够高度 */
}

.el-footer {
  height: 60px;
  background-color: rgb(20, 20, 20);
  color: var(--vt-c-text-dark-1);
  line-height: 60px;
  border-top: 1px solid #333;
  text-align: center; /* 居中显示 */
}

/* Footer 内文：暗色小字 */
.el-footer .footer-text {
  font-size: 12px;
  color: #888; /* 暗色，弱对比度 */
}

/* 内部容器用于控制间距并保持整体居中 */
.el-footer .footer-inner {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.el-footer .footer-sep {
  color: #666;
}
</style>
