<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const container = ref(null)
const props = defineProps({ setUpdateRadar: Function })
let renderer, scene, camera, controls
let radarFrontLeftMesh, radarFrontRightMesh, radarBackLeftMesh, radarBackRightMesh
// 【新增】火焰着色器变量
let flameMesh = null
let flameTime = 0
// 【新增】火焰开关 - 调试用，true=开启，false=关闭
const FLAME_ENABLED = true
// 【改动】雷达历史数据记录,用于判断变化趋势(米),记录最近3帧
const radarHistory = {
  frontLeft: [1.0, 1.0, 1.0],
  frontRight: [1.0, 1.0, 1.0],
  backLeft: [1.0, 1.0, 1.0],
  backRight: [1.0, 1.0, 1.0]
}

// 颜色转换工具函数
const HEX_TO_RGB = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 }
}

const LERP_COLOR = (c1, c2, t) => {
  const a = HEX_TO_RGB(c1)
  const b = HEX_TO_RGB(c2)
  const mix = {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t)
  }
  return `rgb(${mix.r}, ${mix.g}, ${mix.b})`
}

// 雷达颜色渐变：与 RobotStatus.vue 完全一致
// ≤25cm: 纯红, 25-50cm: 红→黄, 50-120cm: 黄→绿, ≥120cm: 纯绿
const radarColorGradient = (cm) => {
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

// 创建扇形几何体
const createRadarGeometry = (radius = 1, angle = Math.PI / 3) => {
  const segments = 32
  const geometry = new THREE.BufferGeometry()
  const vertices = []
  const indices = []
  
  // 添加中心点
  vertices.push(0, 0, 0)
  
  // 添加弧形上的点
  for (let i = 0; i <= segments; i++) {
    const theta = -angle/2 + (angle * i / segments)
    vertices.push(
      Math.cos(theta) * radius,
      0,
      Math.sin(theta) * radius
    )
  }
  
  // 创建三角形
  for (let i = 0; i < segments; i++) {
    indices.push(0, i + 1, i + 2)
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  
  return geometry
}

// 【新增】创建火焰 Shader
const createFlameShader = () => {
  return {
    uniforms: {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector2(512, 512) }
    },

    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,

    fragmentShader: `
      uniform vec2 iResolution;
      uniform float iTime;
      varying vec2 vUv;

      float noise(vec3 p) {
        vec3 i = floor(p);
        vec4 a = dot(i, vec3(1., 57., 21.)) + vec4(0., 57., 21., 78.);
        vec3 f = cos((p-i)*acos(-1.))*(-.5)+.5;
        a = mix(sin(cos(a)*a), sin(cos(1.+a)*(1.+a)), f.x);
        a.xy = mix(a.xz, a.yw, f.y);
        return mix(a.x, a.y, f.z);
      }

      float sphere(vec3 p, vec4 spr) {
        return length(spr.xyz-p) - spr.w;
      }

      float flame(vec3 p) {
        float d = sphere(p*vec3(1.,.5,1.), vec4(.0,-1.,.0,1.));
        return d + (noise(p+vec3(.0,iTime*2.,.0)) + noise(p*3.)*.5)*.25*(p.y);
      }

      float scene(vec3 p) {
        return min(100.-length(p), abs(flame(p)));
      }

      vec4 raymarch(vec3 org, vec3 dir) {
        float d = 0.0, glow = 0.0, eps = 0.02;
        vec3 p = org;
        bool glowed = false;
        
        for(int i=0; i<64; i++) {
          d = scene(p) + eps;
          p += d * dir;
          if(d > eps) {
            if(flame(p) < 0.0) glowed = true;
            if(glowed) glow = float(i)/64.;
          }
        }
        return vec4(p, glow);
      }

      void main() {
        vec2 uv = -1.0 + 2.0 * vUv;
        uv.x *= iResolution.x/iResolution.y;
        
        vec3 org = vec3(0., -2., 4.);
        vec3 dir = normalize(vec3(uv.x*1.6, -uv.y, -1.5));
        
        vec4 p = raymarch(org, dir);
        float glow = p.w;
        
        vec4 col = mix(vec4(1.,.5,.1,1.), vec4(0.1,.5,1.,1.), p.y*.02+.4);
        
        gl_FragColor = mix(vec4(0.), col, pow(glow*2.,2.));
      }
    `
  }
}

// 【新增】创建火焰网格
const createFlameMesh = () => {
  const geometry = new THREE.PlaneGeometry(1.5, 0.8) // 火焰平面大小，Y方向从2改为1
  const shader = createFlameShader()
  const material = new THREE.ShaderMaterial({
    uniforms: shader.uniforms,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide
  })
  
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(0, 1.0, 0) // 设置在 (0, 1, 0) 位置
  
  return mesh
}

// 更新雷达显示
const updateRadar = (frontLeftDist, frontRightDist, backLeftDist, backRightDist) => {
  // 【改动】处理 0 值歧义：默认显示超出上限，只有下降趋势时显示低于下限
  // 通信协议：>450cm 或 <25cm 都返回 0
  // 策略：分析最近3帧数据的变化趋势
  // - 默认：0 → 超出上限 450cm
  // - 仅当呈下降趋势(从大变小)然后变0 → 低于下限 25cm
  const MAX_M = 4.5       // 上限 450cm
  const MIN_M = 0.25      // 下限 25cm
  
  const processZeroWithTrend = (current, history) => {
    if (current !== 0) return current
    
    // current === 0，分析历史趋势
    // history 是最近3帧: [最早, 较早, 最近]
    const validHistory = history.filter(v => v > 0)
    
    // 【改动】默认返回上限，只有明确下降趋势时才返回下限
    if (validHistory.length < 2) {
      // 历史数据不足，默认超出上限
      return MAX_M
    }
    
    // 计算趋势：比较最近两个有效值
    const last = validHistory[validHistory.length - 1]
    const prev = validHistory[validHistory.length - 2]
    
    // 【改动】只有下降趋势才判定为低于下限，其他情况都是超出上限
    return last < prev ? MIN_M : MAX_M
  }
  
  const fl = processZeroWithTrend(frontLeftDist, radarHistory.frontLeft)
  const fr = processZeroWithTrend(frontRightDist, radarHistory.frontRight)
  const bl = processZeroWithTrend(backLeftDist, radarHistory.backLeft)
  const br = processZeroWithTrend(backRightDist, radarHistory.backRight)
  
  // 【改动】更新历史记录：移除最早的，添加当前处理后的值
  radarHistory.frontLeft.shift()
  radarHistory.frontLeft.push(fl)
  radarHistory.frontRight.shift()
  radarHistory.frontRight.push(fr)
  radarHistory.backLeft.shift()
  radarHistory.backLeft.push(bl)
  radarHistory.backRight.shift()
  radarHistory.backRight.push(br)
  
  // 输入的距离单位是米(m)，需要转换为厘米(cm)用于颜色计算
  const frontLeftCm = fl * 100
  const frontRightCm = fr * 100
  const backLeftCm = bl * 100
  const backRightCm = br * 100

  // 更新前方左侧雷达
  if (radarFrontLeftMesh) {
    const colorHex = radarColorGradient(frontLeftCm)
    radarFrontLeftMesh.material.color.set(colorHex)
    const frontLeftGeometry = createRadarGeometry(fl)
    radarFrontLeftMesh.geometry.dispose()
    radarFrontLeftMesh.geometry = frontLeftGeometry
  }

  // 更新前方右侧雷达
  if (radarFrontRightMesh) {
    const colorHex = radarColorGradient(frontRightCm)
    radarFrontRightMesh.material.color.set(colorHex)
    const frontRightGeometry = createRadarGeometry(fr)
    radarFrontRightMesh.geometry.dispose()
    radarFrontRightMesh.geometry = frontRightGeometry
  }

  // 更新后方左侧雷达
  if (radarBackLeftMesh) {
    const colorHex = radarColorGradient(backLeftCm)
    radarBackLeftMesh.material.color.set(colorHex)
    const backLeftGeometry = createRadarGeometry(bl)
    radarBackLeftMesh.geometry.dispose()
    radarBackLeftMesh.geometry = backLeftGeometry
  }

  // 更新后方右侧雷达
  if (radarBackRightMesh) {
    const colorHex = radarColorGradient(backRightCm)
    radarBackRightMesh.material.color.set(colorHex)
    const backRightGeometry = createRadarGeometry(br)
    radarBackRightMesh.geometry.dispose()
    radarBackRightMesh.geometry = backRightGeometry
  }
}

// 处理窗口大小变化
const handleResize = () => {
  if (container.value && camera && renderer) {
    const width = container.value.clientWidth
    const height = container.value.clientHeight
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  }
}

onMounted(() => {
  // 创建场景
  scene = new THREE.Scene()
  scene.background = null // 透明背景，会显示容器的背景色

  // 创建相机
  camera = new THREE.PerspectiveCamera(
    75,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    1000
  )
  camera.position.set(2, 2, 2)

  // 创建渲染器
  renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true // 启用透明通道
  })
  renderer.setClearColor(0x000000, 0) // 设置透明背景
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  container.value.appendChild(renderer.domElement)

  // 创建轨道控制器
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true // 启用阻尼效果
  controls.dampingFactor = 0.05
  controls.minDistance = 1 // 最小缩放距离
  controls.maxDistance = 5 // 最大缩放距离
  controls.enablePan = true // 启用平移
  controls.enableZoom = true // 启用缩放

  // 添加光源
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
  directionalLight.position.set(10, 10, 10)
  scene.add(directionalLight)

  // 添加坐标轴辅助器
  // const axesHelper = new THREE.AxesHelper(1) // 参数1表示坐标轴的长度
  // scene.add(axesHelper) // 红色是X轴，绿色是Y轴，蓝色是Z轴

  // 添加辅助线
  const gridHelper = new THREE.GridHelper(10, 10)
  scene.add(gridHelper)

  // 创建雷达材质
  const radarMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide
  })

  // 创建前方左侧雷达
  const frontLeftGeometry = createRadarGeometry(1)
  radarFrontLeftMesh = new THREE.Mesh(frontLeftGeometry, radarMaterial.clone())
  radarFrontLeftMesh.rotation.x = 0.0
  radarFrontLeftMesh.position.x = 0.47
  radarFrontLeftMesh.position.y = 0.238
  radarFrontLeftMesh.position.z = 0.28
  scene.add(radarFrontLeftMesh)

  // 创建前方右侧雷达
  const frontRightGeometry = createRadarGeometry(1)
  radarFrontRightMesh = new THREE.Mesh(frontRightGeometry, radarMaterial.clone())
  radarFrontRightMesh.rotation.x = 0.0
  radarFrontRightMesh.position.x = 0.47
  radarFrontRightMesh.position.y = 0.239
  radarFrontRightMesh.position.z = -0.28
  scene.add(radarFrontRightMesh)

  // 创建后方左侧雷达
  const backLeftGeometry = createRadarGeometry(1)
  radarBackLeftMesh = new THREE.Mesh(backLeftGeometry, radarMaterial.clone())
  radarBackLeftMesh.rotation.x = 0.0
  radarBackLeftMesh.rotation.y = Math.PI
  radarBackLeftMesh.position.x = -0.43
  radarBackLeftMesh.position.y = 0.238
  radarBackLeftMesh.position.z = 0.28
  scene.add(radarBackLeftMesh)

  // 创建后方右侧雷达
  const backRightGeometry = createRadarGeometry(1)
  radarBackRightMesh = new THREE.Mesh(backRightGeometry, radarMaterial.clone())
  radarBackRightMesh.rotation.x = 0.0
  radarBackRightMesh.rotation.y = Math.PI
  radarBackRightMesh.position.x = -0.43
  radarBackRightMesh.position.y = 0.239
  radarBackRightMesh.position.z = -0.28
  scene.add(radarBackRightMesh)

  // 【新增】创建火焰并添加到场景（根据 FLAME_ENABLED 决定）
  if (FLAME_ENABLED) {
    flameMesh = createFlameMesh()
    scene.add(flameMesh)
  }

  // 加载FBX模型
  const loader = new FBXLoader()
  loader.load('/agv_final.fbx', (object) => {
    // 自动调整模型大小和位置
    const box = new THREE.Box3().setFromObject(object)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = 1 / maxDim
    
    object.scale.setScalar(scale)
    object.position.sub(center.multiplyScalar(scale))
    scene.add(object)

    object.position.y = 0.01

    // 设置初始雷达显示
    updateRadar(1, 1, 1, 1) // 前左、前右、后左、后右
  })

  // 动画循环
  function animate() {
    requestAnimationFrame(animate)
    controls.update()
    
    // 【新增】更新火焰着色器时间（仅当 FLAME_ENABLED 为 true 时）
    if (FLAME_ENABLED && flameMesh) {
      flameTime += 0.016 // 约60fps
      flameMesh.material.uniforms.iTime.value = flameTime
      // 让火焰面向摄像机（billboard效果）
      flameMesh.lookAt(camera.position)
    }
    
    renderer.render(scene, camera)
  }
  animate()

  // 监听窗口大小变化
  window.addEventListener('resize', handleResize)
  // 如果父组件传入了 setUpdateRadar，就把 updateRadar 暴露给父组件
  try {
    if (props && typeof props.setUpdateRadar === 'function') {
      props.setUpdateRadar(updateRadar)
      console.log('ModleDisplay: updateRadar function provided to parent')
    }
  } catch (e) {
    console.warn('ModleDisplay: failed to call setUpdateRadar', e)
  }
})

onUnmounted(() => {
  // 清理资源
  window.removeEventListener('resize', handleResize)
  if (controls) {
    controls.dispose()
  }
  if (renderer) {
    renderer.dispose()
  }
})
</script>

<template>
  <div class="model-container">
    <div ref="container" class="viewer"></div>
  </div>
</template>

<style scoped>
.model-container {
  flex: 1 1 50%; /* 占据左侧约50%空间，与robot-panel对称 */
  min-width: 400px; /* 最小宽度保证3D视图可用 */
  min-height: 600px; /* 确保有足够高度显示模型 */
  display: flex; /* 使内部 viewer 可以填充整个容器 */
  margin: 0;
}

.viewer {
  flex: 1; /* 填充整个父容器 */
  width: 100%;
  background: rgba(29, 30, 31, 0.8);
  backdrop-filter: blur(10px);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
}

.viewer:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
</style>
