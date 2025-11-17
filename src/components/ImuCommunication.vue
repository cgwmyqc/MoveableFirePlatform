<script setup>
import { onMounted, onUnmounted, watch } from 'vue'
import * as ROSLIB from 'roslib'

// 用途：订阅 /imu/data (sensor_msgs/Imu)，基于四元数去重力并积分，估计 x 方向线速度与 z 轴角速度
// 说明：仅 IMU 积分会有漂移，已内置简易去噪/偏置/静止归零(ZUPT)。工程上建议与轮速/定位做融合以提高稳定性。

const props = defineProps({
  // 回调函数或 ref(fn)：传出 { linearX, angularZ, yaw, debug }
  updateImu: [Function, Object]
})

let ros = null
let imuTopic = null
let updateImuFn = null

// 常量与可调参数
const ROSBRIDGE_URL = 'ws://192.168.0.100:9090'
const G = 9.81
// 低通平滑系数 (0-1)，越大越跟随当前数据
const ACC_LPF_ALPHA = 0.35
// 初始偏置采样帧数（假定上电静止）
const CALIB_SAMPLES = 200
// 静止判定阈值（世界系线性加速度与角速度）
const STILL_A_THRESH = 0.08    // m/s^2
const STILL_WZ_THRESH = 0.01   // rad/s
// 异常 dt 限幅，避免大间隔导致速度跳变
const MAX_DT = 0.2             // s

// 状态
let lastTs = null               // s
let vWorld = { x: 0, y: 0, z: 0 }
let lastALinW = null

let calibCount = 0
let accelBiasW = { x: 0, y: 0, z: 0 }
let gyroZBias = 0
let sumAxW = 0, sumAyW = 0, sumAzW = 0, sumWz = 0

// 绑定回调（兼容函数或 ref(fn)）
watch(
  () => props.updateImu,
  (val) => {
    if (typeof val === 'function') {
      updateImuFn = val
    } else if (val && typeof val === 'object' && typeof val.value === 'function') {
      updateImuFn = val.value
    } else {
      updateImuFn = null
    }
  },
  { immediate: true }
)

// 四元数 -> 旋转矩阵 (body->world)
function quatToRot(q) {
  const { x, y, z, w } = q || { x: 0, y: 0, z: 0, w: 1 }
  const xx = x * x, yy = y * y, zz = z * z
  const xy = x * y, xz = x * z, yz = y * z
  const wx = w * x, wy = w * y, wz = w * z
  return [
    [1 - 2 * (yy + zz),     2 * (xy - wz),         2 * (xz + wy)],
    [2 * (xy + wz),         1 - 2 * (xx + zz),     2 * (yz - wx)],
    [2 * (xz - wy),         2 * (yz + wx),         1 - 2 * (xx + yy)]
  ]
}

// 四元数 -> yaw（右手系，Z 轴为上）
function quatToYaw(q) {
  const { x, y, z, w } = q || { x: 0, y: 0, z: 0, w: 1 }
  const siny_cosp = 2 * (w * z + x * y)
  const cosy_cosp = 1 - 2 * (y * y + z * z)
  return Math.atan2(siny_cosp, cosy_cosp)
}

function mat3MulVec3(m, v) {
  return {
    x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
    y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
    z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z
  }
}

function lpfVec(prev, curr, alpha) {
  if (!prev) return curr
  return {
    x: prev.x + alpha * (curr.x - prev.x),
    y: prev.y + alpha * (curr.y - prev.y),
    z: prev.z + alpha * (curr.z - prev.z)
  }
}

onMounted(() => {
  try {
    ros = new ROSLIB.Ros({
      url: ROSBRIDGE_URL,
      options: {
        reconnection: true,
        keepalive: true
      }
    })

    ros.on('connection', () => {
      try {
        imuTopic = new ROSLIB.Topic({
          ros,
          name: '/imu/data',
          messageType: 'sensor_msgs/Imu'
        })
        console.log('Subscribing to /imu/data (sensor_msgs/Imu)')
        imuTopic.subscribe((msg) => {
          // 时间戳
          const sec = msg?.header?.stamp?.sec ?? null
          const nsec = msg?.header?.stamp?.nanosec ?? 0
          const t = sec !== null ? (sec + nsec / 1e9) : (Date.now() / 1000)
          let dt = lastTs == null ? 0 : (t - lastTs)
          lastTs = t
          if (!(dt > 0) || dt > MAX_DT) dt = Math.min(Math.max(dt || 0, 0), MAX_DT)

          // 角速度 z（减去初始偏置）
          const wzRaw = Number(msg?.angular_velocity?.z ?? 0)
          // 线加速度（机体系，含重力）
          const aBody = {
            x: Number(msg?.linear_acceleration?.x ?? 0),
            y: Number(msg?.linear_acceleration?.y ?? 0),
            z: Number(msg?.linear_acceleration?.z ?? 0)
          }
          // 姿态
          const q = {
            x: Number(msg?.orientation?.x ?? 0),
            y: Number(msg?.orientation?.y ?? 0),
            z: Number(msg?.orientation?.z ?? 0),
            w: Number(msg?.orientation?.w ?? 1)
          }

          // 旋转到世界系并去重力
          const R = quatToRot(q)
          const aWorld = mat3MulVec3(R, aBody)
          let aLinW = { x: aWorld.x, y: aWorld.y, z: aWorld.z - G }

          // 初始静止期采样偏置（在世界系）
          if (calibCount < CALIB_SAMPLES) {
            sumAxW += aLinW.x
            sumAyW += aLinW.y
            sumAzW += aLinW.z
            sumWz += wzRaw
            calibCount++
            if (calibCount === CALIB_SAMPLES) {
              accelBiasW = {
                x: sumAxW / CALIB_SAMPLES,
                y: sumAyW / CALIB_SAMPLES,
                z: sumAzW / CALIB_SAMPLES
              }
              gyroZBias = sumWz / CALIB_SAMPLES
              console.log('IMU bias calibrated:', accelBiasW, 'gyroZBias:', gyroZBias)
            }
          }

          // 去偏置 + 低通
          aLinW = {
            x: aLinW.x - accelBiasW.x,
            y: aLinW.y - accelBiasW.y,
            z: aLinW.z - accelBiasW.z
          }
          aLinW = lpfVec(lastALinW, aLinW, ACC_LPF_ALPHA)

          const wz = wzRaw - gyroZBias

          // 静止检测 (ZUPT)：极低角速且线加速度接近 0
          const still = (Math.abs(wz) < STILL_WZ_THRESH) &&
                        (Math.hypot(aLinW.x, aLinW.y, aLinW.z) < STILL_A_THRESH)

          // 速度积分（世界系）
          if (dt > 0) {
            if (still) {
              vWorld = { x: 0, y: 0, z: 0 }
            } else {
              if (lastALinW) {
                vWorld.x += 0.5 * (aLinW.x + lastALinW.x) * dt
                vWorld.y += 0.5 * (aLinW.y + lastALinW.y) * dt
                vWorld.z += 0.5 * (aLinW.z + lastALinW.z) * dt
              } else {
                vWorld.x += aLinW.x * dt
                vWorld.y += aLinW.y * dt
                vWorld.z += aLinW.z * dt
              }
            }
          }

          lastALinW = aLinW

          // 取 yaw，将世界系速度投影到车体前向（假设车体前向与 yaw 对齐）
          const yaw = quatToYaw(q)
          const vx = vWorld.x * Math.cos(yaw) + vWorld.y * Math.sin(yaw)

          // 输出回调
          if (typeof updateImuFn === 'function') {
            updateImuFn({
              linearX: vx,
              angularZ: wz,
              yaw,
              debug: { dt, aLinW, vWorld }
            })
          }
        })
      } catch (e) {
        console.error('Failed to create/subscribe /imu/data:', e)
      }
    })

    ros.on('error', (err) => {
      console.error('ROS connection error (IMU):', err)
    })

    ros.on('close', () => {
      console.log('ROS connection closed (IMU)')
    })
  } catch (err) {
    console.error('Failed to initialize ROS (IMU):', err)
  }
})

onUnmounted(() => {
  try { if (imuTopic) imuTopic.unsubscribe() } catch (e) { /* noop */ }
  try { if (ros) ros.close() } catch (e) { /* noop */ }
})

// 不展示任何 UI
defineExpose({})
</script>

<template>
  <div style="display:none"></div>
</template>
