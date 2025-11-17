<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import * as ROSLIB from 'roslib'

// ROS 相关
let ros = null
let followerTopic = null

// 电池电量
const batteryLevel = ref(80)
// 速度数据
const speedData = ref([])
// 雷达数据
const radarData = ref({
  frontLeft: 0,
  frontRight: 0,
  backLeft: 0,
  backRight: 0
})
// 巡线状态
const isPatrolling = ref(false)

let speedChart = null

// 初始化速度图表
const initSpeedChart = (chartDom) => {
  speedChart = echarts.init(chartDom)
  const option = {
    grid: {
      top: 20,
      right: 20,
      bottom: 20,
      left: 40
    },
    xAxis: {
      type: 'category',
      data: Array(20).fill(0).map((_, i) => i),
      axisLine: {
        lineStyle: {
          color: '#666'
        }
      }
    },
    yAxis: {
      type: 'value',
      name: '速度(m/s)',
      nameTextStyle: {
        color: '#666'
      },
      axisLine: {
        lineStyle: {
          color: '#666'
        }
      },
      splitLine: {
        lineStyle: {
          color: '#333'
        }
      }
    },
    series: [{
      data: Array(20).fill(0),
      type: 'line',
      smooth: true,
      color: '#41b883'
    }]
  }
  speedChart.setOption(option)
}

// 更新速度图表数据
const updateSpeedChart = (newSpeed) => {
  if (!speedChart) return
  
  speedData.value.push(newSpeed)
  if (speedData.value.length > 20) {
    speedData.value.shift()
  }

  speedChart.setOption({
    series: [{
      data: speedData.value
    }]
  })
}

// 更新雷达数据
const updateRadarInfo = (fl, fr, bl, br) => {
  radarData.value = {
    frontLeft: fl,
    frontRight: fr,
    backLeft: bl,
    backRight: br
  }
}

// 初始化ROS连接
const initROS = () => {
  try {
    ros = new ROSLIB.Ros({
      url: 'ws://192.168.0.100:9090'
    })

    ros.on('connection', () => {
      console.log('Connected to ROS websocket server')
      initFollowerTopic()
    })

    ros.on('error', (error) => {
      console.error('ROS连接错误:', error)
    })

    ros.on('close', () => {
      console.log('ROS连接已关闭')
    })
  } catch (error) {
    console.error('ROS初始化失败:', error)
  }
}

// 初始化巡线话题
const initFollowerTopic = () => {
  try {
    followerTopic = new ROSLIB.Topic({
      ros: ros,
      name: '/start_follower_cmd',
      messageType: 'std_msgs/msg/Bool'
    })
    console.log('巡线话题已初始化')
  } catch (error) {
    console.error('巡线话题初始化失败:', error)
  }
}

// 发布巡线命令
const publishFollowerCommand = (isActive) => {
  if (!ros?.isConnected) {
    console.error('ROS未连接')
    return
  }

  if (!followerTopic) {
    console.error('巡线话题未初始化')
    return
  }

  try {
    const message = new ROSLIB.Message({
      data: Boolean(isActive)
    })
    followerTopic.publish(message)
    console.log('已发送巡线命令:', isActive)
  } catch (error) {
    console.error('发送巡线命令失败:', error)
    // 发送失败时恢复按钮状态
    isPatrolling.value = !isPatrolling.value
  }
}

// 处理巡线按钮点击
const handlePatrolClick = () => {
  isPatrolling.value = !isPatrolling.value
  console.log(`巡线命令: ${isPatrolling.value ? '开始' : '停止'}`)
  publishFollowerCommand(isPatrolling.value)
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
  
  // 初始化ROS连接
  initROS()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  speedChart?.dispose()
  
  // 清理ROS连接
  if (ros) {
    ros.close()
  }
})

defineExpose({
  updateRadarInfo,
  updateSpeedChart
})
</script>

<template>
  <div class="robot-status">
    <el-row :gutter="20">
      <!-- 电池状态 -->
      <el-col :span="24">
        <el-card class="status-card">
          <div class="battery-status">
            <el-progress
              type="dashboard"
              :percentage="batteryLevel"
              :color="[
                { color: '#f56c6c', percentage: 20 },
                { color: '#e6a23c', percentage: 40 },
                { color: '#5cb87a', percentage: 100 }
              ]"
            >
              <template #default="{ percentage }">
                <div class="battery-text">
                  <i class="el-icon-battery" style="font-size: 20px"></i>
                  <span>{{ percentage }}%</span>
                </div>
              </template>
            </el-progress>
          </div>
        </el-card>
      </el-col>

      <!-- 速度曲线 -->
      <el-col :span="24">
        <el-card class="status-card">
          <template #header>
            <div class="card-header">
              <span>速度曲线</span>
            </div>
          </template>
          <div id="speedChart" class="speed-chart"></div>
        </el-card>
      </el-col>

      <!-- 雷达信息 -->
      <el-col :span="24">
        <el-card class="status-card">
          <template #header>
            <div class="card-header">
              <span>超声波雷达信息</span>
            </div>
          </template>
          <div class="radar-info">
            <el-row :gutter="20">
              <el-col :span="12">
                <div class="radar-item">
                  <span>前左：{{ radarData.frontLeft.toFixed(2) }}m</span>
                </div>
                <div class="radar-item">
                  <span>前右：{{ radarData.frontRight.toFixed(2) }}m</span>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="radar-item">
                  <span>后左：{{ radarData.backLeft.toFixed(2) }}m</span>
                </div>
                <div class="radar-item">
                  <span>后右：{{ radarData.backRight.toFixed(2) }}m</span>
                </div>
              </el-col>
            </el-row>
          </div>
        </el-card>
      </el-col>

      <!-- 控制按钮 -->
      <el-col :span="24">
        <el-card class="status-card">
          <template #header>
            <div class="card-header">
              <span>控制命令</span>
            </div>
          </template>
          <el-button
            type="primary"
            :class="{ 'is-patrolling': isPatrolling }"
            @click="handlePatrolClick"
          >
            {{ isPatrolling ? '停止巡线' : '开始巡线' }}
          </el-button>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.robot-status {
  width: 55%;
  margin-left: 5%;
  height: 100%;
  overflow-y: auto;
}

.status-card {
  margin-bottom: 20px;
  background-color: var(--vt-c-black-soft);
  border: 1px solid var(--vt-c-black-mute);
  color: var(--vt-c-text-dark-1);
}

.status-card :deep(.el-card__header) {
  border-bottom: 1px solid var(--vt-c-black-mute);
  padding: 10px 20px;
}

.battery-status {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}

.battery-text {
  font-size: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.speed-chart {
  height: 200px;
  width: 100%;
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

.is-patrolling {
  background-color: #67c23a;
}

:deep(.el-progress) {
  width: 150px;
  height: 150px;
}
</style>