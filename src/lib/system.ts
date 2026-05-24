export interface SystemSpecs {
  cpuCores: number | string
  deviceMemory: number | string
  gpuVendor: string
  gpuRenderer: string
  gpuType: 'Discrete GPU' | 'Integrated GPU' | 'Software/WASM Fallback' | 'Unknown'
  webgpuSupported: boolean
  activeDriver: string
}

export function getSystemSpecs(): SystemSpecs {
  const specs: SystemSpecs = {
    cpuCores: 'Unknown',
    deviceMemory: 'Unknown',
    gpuVendor: 'Unknown',
    gpuRenderer: 'Unknown',
    gpuType: 'Unknown',
    webgpuSupported: false,
    activeDriver: 'WASM (CPU Fallback)'
  }

  if (typeof navigator !== 'undefined') {
    specs.cpuCores = navigator.hardwareConcurrency || 'Unknown'
    specs.deviceMemory = 'deviceMemory' in navigator ? `${(navigator as Navigator & { deviceMemory?: number }).deviceMemory} GB+` : 'Unknown'
    specs.webgpuSupported = 'gpu' in navigator
  }

  if (typeof window !== 'undefined') {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (gl instanceof WebGLRenderingContext) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          specs.gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown'
          specs.gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown'

          const renderer = specs.gpuRenderer.toLowerCase()

          // Detect discrete GPU models
          if (
            renderer.includes('rtx') ||
            renderer.includes('gtx') ||
            renderer.includes('geforce') ||
            renderer.includes('nvidia') ||
            renderer.includes('radeon') ||
            renderer.includes('navi') ||
            (renderer.includes('amd') && !renderer.includes('apu') && !renderer.includes('graphics')) ||
            renderer.includes('arc') ||
            renderer.includes('quadro') ||
            renderer.includes('tesla')
          ) {
            specs.gpuType = 'Discrete GPU'
          } else if (
            renderer.includes('intel') ||
            renderer.includes('hd graphics') ||
            renderer.includes('iris') ||
            renderer.includes('amd radeon') && renderer.includes('graphics') ||
            renderer.includes('apu') ||
            renderer.includes('swiftshader')
          ) {
            specs.gpuType = 'Integrated GPU'
          } else if (renderer.includes('apple') || renderer.includes('m1') || renderer.includes('m2') || renderer.includes('m3') || renderer.includes('m4')) {
            // Apple Silicon unified memory GPUs are high-performance integrated
            specs.gpuType = 'Discrete GPU' // Count Apple Silicon as dGPU equivalent for our high performance target
          } else {
            specs.gpuType = 'Unknown'
          }
        }
      }
    } catch (_e) {
      console.warn('[WebRAG] System diagnostics WebGL query skipped or failed:', _e)
    }
  }

  // Determine active driver priority
  if (specs.webgpuSupported) {
    if (specs.gpuType === 'Discrete GPU') {
      specs.activeDriver = 'WebGPU (Discrete GPU prioritized)'
    } else if (specs.gpuType === 'Integrated GPU') {
      specs.activeDriver = 'WebGPU (Integrated GPU active)'
    } else {
      specs.activeDriver = 'WebGPU (Hardware Accelerated)'
    }
  } else {
    specs.activeDriver = 'WASM (High-Performance CPU)'
  }

  return specs
}
