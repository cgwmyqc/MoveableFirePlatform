<script setup>
import { ref, onMounted } from 'vue'

const currentTime = ref({
  hours: '00',
  minutes: '00',
  seconds: '00',
  period: 'AM',
  date: ''
})

const updateTime = () => {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()
  
  currentTime.value = {
    hours: hours.toString().padStart(2, '0'),
    minutes: minutes.toString().padStart(2, '0'),
    seconds: seconds.toString().padStart(2, '0'),
    period: hours >= 12 ? '下午' : '上午',
    date: now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    })
  }
}

onMounted(() => {
  updateTime()
  setInterval(updateTime, 1000)
})
</script>

<template>
  <el-header>
    <div class="header-content">
      <div class="header-left">移动载火平台控制软件</div>
      <div class="header-right">
        <div class="time-display">
          <div class="time-container">
            <span class="time-unit">{{ currentTime.hours }}:{{ currentTime.minutes }}:{{ currentTime.seconds }}</span>
            <span class="period">{{ currentTime.period }}</span>
          </div>
          <div class="date">{{ currentTime.date }}</div>
        </div>
      </div>
    </div>
  </el-header>
</template>

<style scoped>
.el-header {
  height: 60px;
  background-color: rgb(20, 20, 20);
  color: var(--vt-c-text-dark-1);
  line-height: 60px;
  border-bottom: 1px solid #333;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  padding: 0 20px;
}

.header-left {
  font-size: 28px;
  font-weight: bold;
}

.header-right {
  font-size: 16px;
}

.time-display {
  background-color: rgb(20, 20, 20);
  padding: 8px 15px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.time-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-unit {
  font-size: 20px;
  font-family: 'Digital', monospace;
  font-weight: 500;
  letter-spacing: 1px;
  color: #fff;
  line-height: 1;
}

.period {
  font-size: 14px;
  color: #999;
  margin-left: 0px;
  line-height: 1;
}

.date {
  font-size: 12px;
  color: #999;
  text-align: center;
  line-height: 1;
}
</style>