<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

// ROS 相关
const ROSLIB = window.ROSLIB
let ros = null
let followerTopic = null
let followerCycleTopic = null
let radarEnableTopic = null

// 巡线状态
const isPatrolling = ref(false)
const isCyclePatrolling = ref(false)
// 雷达防撞使能状态
const radarEnabled = ref(true)

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
      name: '/start_follower_once_cmd',
      messageType: 'std_msgs/msg/Bool'
    })
    console.log('单次巡线话题已初始化')
    
    followerCycleTopic = new ROSLIB.Topic({
      ros: ros,
      name: '/start_follower_cycle_cmd',
      messageType: 'std_msgs/msg/Bool'
    })
    console.log('循环巡线话题已初始化')
    
    radarEnableTopic = new ROSLIB.Topic({
      ros: ros,
      name: '/radar_enable',
      messageType: 'std_msgs/msg/Bool'
    })
    console.log('雷达防撞使能话题已初始化')
    
    // 初始化时发送默认开启状态
    publishRadarEnable(radarEnabled.value)
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

// 发布循环巡线命令
const publishCycleFollowerCommand = (isActive) => {
  if (!ros?.isConnected) {
    console.error('ROS未连接')
    return
  }

  if (!followerCycleTopic) {
    console.error('循环巡线话题未初始化')
    return
  }

  try {
    const message = new ROSLIB.Message({
      data: Boolean(isActive)
    })
    followerCycleTopic.publish(message)
    console.log('已发送循环巡线命令:', isActive)
  } catch (error) {
    console.error('发送循环巡线命令失败:', error)
    // 发送失败时恢复按钮状态
    isCyclePatrolling.value = !isCyclePatrolling.value
  }
}

// 发布雷达防撞使能命令
const publishRadarEnable = (isEnabled) => {
  if (!ros?.isConnected) {
    console.error('ROS未连接')
    return
  }

  if (!radarEnableTopic) {
    console.error('雷达防撞使能话题未初始化')
    return
  }

  try {
    const message = new ROSLIB.Message({
      data: Boolean(isEnabled)
    })
    radarEnableTopic.publish(message)
    console.log('已发送雷达防撞使能命令:', isEnabled)
  } catch (error) {
    console.error('发送雷达防撞使能命令失败:', error)
  }
}

// 处理单次巡线按钮点击
const handlePatrolClick = () => {
  // 如果循环巡线正在运行，不允许启动单次巡线
  if (isCyclePatrolling.value) {
    console.warn('循环巡线正在运行，无法启动单次巡线')
    return
  }
  
  isPatrolling.value = !isPatrolling.value
  console.log(`单次巡线命令: ${isPatrolling.value ? '开始' : '停止'}`)
  publishFollowerCommand(isPatrolling.value)
}

// 处理循环巡线按钮点击
const handleCyclePatrolClick = () => {
  // 如果单次巡线正在运行，不允许启动循环巡线
  if (isPatrolling.value) {
    console.warn('单次巡线正在运行，无法启动循环巡线')
    return
  }
  
  isCyclePatrolling.value = !isCyclePatrolling.value
  console.log(`循环巡线命令: ${isCyclePatrolling.value ? '开始' : '停止'}`)
  publishCycleFollowerCommand(isCyclePatrolling.value)
}

// 处理雷达防撞使能切换
const handleRadarEnableChange = (value) => {
  console.log(`雷达防撞使能: ${value ? '开启' : '关闭'}`)
  publishRadarEnable(value)
}

onMounted(() => {
  // 初始化ROS连接
  initROS()
})

onUnmounted(() => {
  // 清理ROS连接
  if (ros) {
    ros.close()
  }
})
</script>

<template>
  <div class="robot-control">
    <el-row :gutter="20">
      <!-- 控制按钮 -->
      <el-col :span="24">
        <el-card class="control-card">
          <template #header>
            <div class="card-header">
              <span>控制命令</span>
            </div>
          </template>
          <el-button
            type="primary"
            :class="{ 'is-patrolling': isPatrolling }"
            :disabled="isCyclePatrolling"
            @click="handlePatrolClick"
          >
            {{ isPatrolling ? '停止单次巡线' : '开始单次巡线' }}
          </el-button>
          <el-button
            type="primary"
            :class="{ 'is-patrolling': isCyclePatrolling }"
            :disabled="isPatrolling"
            @click="handleCyclePatrolClick"
            style="margin-left: 24px;"
          >
            {{ isCyclePatrolling ? '停止循环巡线' : '开始循环巡线' }}
          </el-button>
          <div style="display: inline-flex; align-items: center; margin-left: 24px;">
            <span style="margin-right: 8px; color: var(--vt-c-text-dark-1);">雷达防撞使能</span>
            <el-switch
              v-model="radarEnabled"
              @change="handleRadarEnableChange"
              style="--el-switch-on-color: #67c23a;"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.robot-control {
  width: 100%;
  margin-bottom: 0;
  margin-top: 20px; /* 与上方机器人参数卡片保持 20px 间距 */
  padding: 0; /* 移除内边距，避免额外间距累加 */
}

.control-card {
  background-color: var(--vt-c-black-soft);
  border: 1px solid var(--vt-c-black-mute);
  color: var(--vt-c-text-dark-1);
}

.control-card :deep(.el-card__header) {
  border-bottom: 1px solid var(--vt-c-black-mute);
  padding: 10px 20px;
}

.is-patrolling {
  background-color: #67c23a;
}
</style>