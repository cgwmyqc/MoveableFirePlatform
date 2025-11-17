<script setup>
import { onMounted, onUnmounted, watch } from 'vue'

const ROSLIB = window.ROSLIB

const props = defineProps({
  updateRadar: [Function, Object],
  updateVoltage: [Function, Object],
  updateSpeed: [Function, Object],  // 线速度 x
  updateAngular: [Function, Object], // 角速度 z
  updateConnectionStatus: [Function, Object], // 连接状态
  updateHostIp: [Function, Object], // 上位机IP
  updateLineFollowingStatus: [Function, Object] // 巡线状态
})

let ros = null
let radarTopic = null
let powerVoltageTopic = null
let speedTopic = null
let lineFollowingTopic = null
let clientsTopic = null
// 当从 /connected_clients 成功获取到 IP 后，锁定，避免被本地 WebRTC 兜底覆盖
let hostIpLocked = false
let updateRadarFn = null
let updateVoltageFn = null
let updateSpeedFn = null
let updateAngularFn = null
let updateConnectionStatusFn = null
let updateHostIpFn = null
let updateLineFollowingStatusFn = null

// 监听父组件传来的 updateRadar（函数或 ref）
watch(
  () => props.updateRadar,
  (val) => {
    if (typeof val === 'function') {
      updateRadarFn = val
      console.log('RosCommunication: received updateRadar function')
    } else if (val && typeof val === 'object' && typeof val.value === 'function') {
      updateRadarFn = val.value
      console.log('RosCommunication: received updateRadar ref')
    } else {
      updateRadarFn = null
      console.log('RosCommunication: updateRadar not available yet')
    }
  },
  { immediate: true }
)

watch(
  () => props.updateVoltage,
  (val) => {
    if (typeof val === 'function') {
      updateVoltageFn = val
      console.log('RosCommunication: received updateVoltage function')
    } else if (val && typeof val === 'object' && typeof val.value === 'function') {
      updateVoltageFn = val.value
      console.log('RosCommunication: received updateVoltage ref')
    } else {
      updateVoltageFn = null
      console.log('RosCommunication: updateVoltage not available yet')
    }
  },
  { immediate: true }
)

// 监听父组件传来的 updateSpeed（函数或 ref）
watch(
  () => props.updateSpeed,
  (val) => {
    if (typeof val === 'function') {
      updateSpeedFn = val
      console.log('RosCommunication: received updateSpeed function')
    } else if (val && typeof val === 'object' && typeof val.value === 'function') {
      updateSpeedFn = val.value
      console.log('RosCommunication: received updateSpeed ref')
    } else {
      updateSpeedFn = null
      console.log('RosCommunication: updateSpeed not available yet')
    }
  },
  { immediate: true }
)

// 监听父组件传来的 updateAngular（函数或 ref）
watch(
  () => props.updateAngular,
  (val) => {
    if (typeof val === 'function') {
      updateAngularFn = val
      console.log('RosCommunication: received updateAngular function')
    } else if (val && typeof val === 'object' && typeof val.value === 'function') {
      updateAngularFn = val.value
      console.log('RosCommunication: received updateAngular ref')
    } else {
      updateAngularFn = null
      console.log('RosCommunication: updateAngular not available yet')
    }
  },
  { immediate: true }
)

// 监听父组件传来的 updateConnectionStatus（函数或 ref）
watch(
  () => props.updateConnectionStatus,
  (val) => {
    if (typeof val === 'function') {
      updateConnectionStatusFn = val
      console.log('RosCommunication: received updateConnectionStatus function')
    } else if (val && typeof val === 'object' && typeof val.value === 'function') {
      updateConnectionStatusFn = val.value
      console.log('RosCommunication: received updateConnectionStatus ref')
    } else {
      updateConnectionStatusFn = null
      console.log('RosCommunication: updateConnectionStatus not available yet')
    }
  },
  { immediate: true }
)

// 监听父组件传来的 updateHostIp（函数或 ref）
watch(
  () => props.updateHostIp,
  (val) => {
    if (typeof val === 'function') {
      updateHostIpFn = val
      console.log('RosCommunication: received updateHostIp function')
    } else if (val && typeof val === 'object' && typeof val.value === 'function') {
      updateHostIpFn = val.value
      console.log('RosCommunication: received updateHostIp ref')
    } else {
      updateHostIpFn = null
      console.log('RosCommunication: updateHostIp not available yet')
    }
  },
  { immediate: true }
)

// 监听父组件传来的 updateLineFollowingStatus（函数或 ref）
watch(
  () => props.updateLineFollowingStatus,
  (val) => {
    if (typeof val === 'function') {
      updateLineFollowingStatusFn = val
      console.log('RosCommunication: received updateLineFollowingStatus function')
    } else if (val && typeof val === 'object' && typeof val.value === 'function') {
      updateLineFollowingStatusFn = val.value
      console.log('RosCommunication: received updateLineFollowingStatus ref')
    } else {
      updateLineFollowingStatusFn = null
      console.log('RosCommunication: updateLineFollowingStatus not available yet')
    }
  },
  { immediate: true }
)

onMounted(() => {
  console.log('RosCommunication mounted, initializing roslib connection')

  // 获取上位机IP（浏览器所在机器的本地IP）
  try {
    // 通过创建临时RTCPeerConnection获取本地IP（仅作为兜底，且不会覆盖 /connected_clients）
    const getLocalIp = () => {
      return new Promise((resolve) => {
        const RTCPeerConnection = window.RTCPeerConnection || 
                                  window.webkitRTCPeerConnection || 
                                  window.mozRTCPeerConnection
        
        if (!RTCPeerConnection) {
          resolve(null) // 不返回“无法获取”，避免覆盖显示
          return
        }

        const pc = new RTCPeerConnection({ iceServers: [] })
        pc.createDataChannel('')
        
        pc.onicecandidate = (ice) => {
          if (!ice || !ice.candidate || !ice.candidate.candidate) return
          
          const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/
          const match = ipRegex.exec(ice.candidate.candidate)
          
          if (match && match[1]) {
            resolve(match[1])
            pc.close()
          }
        }
        
        pc.createOffer().then(offer => pc.setLocalDescription(offer))
        
        // 超时处理
        setTimeout(() => {
          resolve(null)
          pc.close()
        }, 2000)
      })
    }

    getLocalIp().then(ip => {
      // 仅当未被 /connected_clients 设置且拿到的 ip 合法时，才作为兜底显示
      if (!hostIpLocked && ip && typeof ip === 'string') {
        const valid = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)
        if (valid && typeof updateHostIpFn === 'function') {
          updateHostIpFn(ip)
        }
      }
    })
  } catch (e) {
    console.warn('Failed to get local IP:', e)
  }

  try {
    // 确保这个 URL 匹配你的 ROS2 主机地址
    ros = new ROSLIB.Ros({ 
      url: 'ws://192.168.0.100:9090',
      options: {
        reconnection: true,
        keepalive: true,
        transportOptions: {
          websocket: {
            protocols: ['json']
          }
        }
      }
    })

    ros.on('connection', () => {
      console.log('Connected to websocket server.')
      
      // 更新连接状态为已连接
      if (typeof updateConnectionStatusFn === 'function') {
        updateConnectionStatusFn(true)
      }

      try {
        // 设置雷达数据订阅
        radarTopic = new ROSLIB.Topic({
          ros,
          name: '/radar_multi_array',
          messageType: 'std_msgs/UInt16MultiArray'
        })

  console.log('Subscribing to /radar_multi_array and /PowerVoltage')
        radarTopic.subscribe((msg) => {
        //   console.log('Received radar_multi_array:', msg)
          const data = msg && msg.data ? msg.data : null
          if (Array.isArray(data) && data.length >= 4) {
            // 将收到的值转换为模型长度单位（如果需要）并调用父组件的 updateRadar
            if (typeof updateRadarFn === 'function') {
              updateRadarFn(data[3] / 1000, data[2] / 1000, data[1] / 1000, data[0] / 1000)
            } else {
              console.warn('updateRadar function not yet available')
            }
          } else {
            console.warn('radar_multi_array data invalid:', data)
          }
        })
        // 电压订阅
        powerVoltageTopic = new ROSLIB.Topic({
          ros,
            name: '/PowerVoltage',
            messageType: 'std_msgs/Float32'
        })
        powerVoltageTopic.subscribe((msg) => {
          if (msg && typeof msg.data === 'number') {
            if (typeof updateVoltageFn === 'function') {
              updateVoltageFn(msg.data)
            }
          }
        })

        // 速度订阅：只取 linear.x
        // ROS2 geometry_msgs/msg/Twist 在 rosbridge 中使用 messageType 'geometry_msgs/Twist'
        speedTopic = new ROSLIB.Topic({
          ros,
          name: '/cmd_vel',
          messageType: 'geometry_msgs/Twist'
        })
        console.log('Subscribing to /cmd_vel (geometry_msgs/Twist)')
        speedTopic.subscribe((msg) => {
          // 期望结构：{ linear: { x, y, z }, angular: { x, y, z } }
          try {
            const lx = (msg && msg.linear && typeof msg.linear.x === 'number') ? msg.linear.x : null
            const wz = (msg && msg.angular && typeof msg.angular.z === 'number') ? msg.angular.z : null
            // 控制台记录原始数据，便于对照分析
            console.log('[cmd_vel] linear.x =', lx, ', angular.z =', wz)
          } catch (e) {
            console.warn('Failed to log cmd_vel message:', e)
          }
          if (msg && msg.linear && typeof msg.linear.x === 'number') {
            if (typeof updateSpeedFn === 'function') {
              updateSpeedFn(msg.linear.x)
            }
          } else {
            console.warn('cmd_vel message invalid:', msg)
          }
          // 同时处理角速度 z
          if (msg && msg.angular && typeof msg.angular.z === 'number') {
            if (typeof updateAngularFn === 'function') {
              updateAngularFn(msg.angular.z)
            }
          }
        })

        // 巡线状态订阅：话题名为 /start_follower_once_cmd，消息类型为 std_msgs/Bool
        lineFollowingTopic = new ROSLIB.Topic({
          ros,
          name: '/start_follower_once_cmd',
          messageType: 'std_msgs/Bool'
        })
        console.log('Subscribing to /start_follower_once_cmd (std_msgs/Bool)')
        lineFollowingTopic.subscribe((msg) => {
          if (msg && typeof msg.data === 'boolean') {
            if (typeof updateLineFollowingStatusFn === 'function') {
              updateLineFollowingStatusFn(msg.data)
            }
          } else {
            console.warn('line_following_status message invalid:', msg)
          }
        })

        // 订阅 rosbridge 发布的已连接客户端信息（上位机 IP 列表）
        // 消息类型: rosbridge_msgs/ConnectedClients
        // 结构示例： { clients: [ { ip_address: '192.168.0.155', connection_time: { sec, nanosec } }, ... ] }
        clientsTopic = new ROSLIB.Topic({
          ros,
          name: '/connected_clients',
          messageType: 'rosbridge_msgs/ConnectedClients'
        })
        console.log('Subscribing to /connected_clients (rosbridge_msgs/ConnectedClients)')
        clientsTopic.subscribe((msg) => {
          try {
            if (msg && Array.isArray(msg.clients)) {
              const ips = msg.clients
                .map(c => c && c.ip_address)
                .filter(ip => typeof ip === 'string' && ip.length > 0)
              if (ips.length) {
                // 去重
                const unique = [...new Set(ips)]
                const ipDisplay = unique.join(', ')
                if (typeof updateHostIpFn === 'function') {
                  updateHostIpFn(ipDisplay)
                }
                hostIpLocked = true // 由话题数据驱动后，锁定显示，不再被兜底覆盖
              }
            }
          } catch (e) {
            console.warn('Failed to process /connected_clients message:', e)
          }
        })
      } catch (e) {
        console.error('Failed to create/subscribe topic:', e)
      }
    })

    ros.on('error', (err) => {
      console.error('ROS connection error:', err)
      // 更新连接状态为未连接
      if (typeof updateConnectionStatusFn === 'function') {
        updateConnectionStatusFn(false)
      }
    })

    ros.on('close', () => {
      console.log('ROS connection closed')
      // 更新连接状态为未连接
      if (typeof updateConnectionStatusFn === 'function') {
        updateConnectionStatusFn(false)
      }
    })
  } catch (err) {
    console.error('Failed to initialize ROS:', err)
  }
})

onUnmounted(() => {
  try {
    if (radarTopic) radarTopic.unsubscribe()
    if (powerVoltageTopic) powerVoltageTopic.unsubscribe()
    if (speedTopic) speedTopic.unsubscribe()
    if (clientsTopic) clientsTopic.unsubscribe()
    if (lineFollowingTopic) lineFollowingTopic.unsubscribe()
  } catch (e) {
    console.warn('Error unsubscribing radar topic', e)
  }
  try {
    if (ros) ros.close()
  } catch (e) {
    console.warn('Error closing ros connection', e)
  }
})

// 不需要暴露任何方法
defineExpose({})
</script>

<template>
  <div style="display:none"></div>
</template>