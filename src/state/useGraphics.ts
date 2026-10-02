import { useMemo } from 'react'
import { create } from 'zustand'
import { useDeviceClass, type DeviceClass } from './deviceClass'
import {
  effectiveToggles,
  levelOf,
  lowerLevel,
  renderConfig,
  type DeviceSignals,
  type FormFactor,
  type GraphicsLevel,
  type GraphicsToggles,
  type RenderConfig,
} from './graphics'
import { useApp } from './useApp'

/** Phones get the phone caps; tablets and computers the larger ones. */
export const formOf = (deviceClass: DeviceClass): FormFactor => (deviceClass === 'tablet' ? 'tablet' : 'phone')

let rendererName: string | undefined | null = null

/** The GPU's name from a throwaway WebGL context (once; undefined when the browser hides it). */
function gpuName(): string | undefined {
  if (rendererName !== null) return rendererName
  rendererName = undefined
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    if (gl && ext) rendererName = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    /* no WebGL: the other signals decide */
  }
  return rendererName
}

let signals: DeviceSignals | null = null

/** What this browser tells about the device (read once). */
export function deviceSignals(): DeviceSignals {
  if (signals) return signals
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return { mobile: false, dpr: 1 }
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } }
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  const mobileUa = nav.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent)
  // iPadOS reports a desktop Safari user agent: touch points give it away.
  const ipad = /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1
  signals = {
    memoryGb: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    mobile: mobileUa || ipad || (coarse && nav.maxTouchPoints > 0),
    dpr: window.devicePixelRatio || 1,
    renderer: gpuName(),
  }
  return signals
}

/** The level the stored preset stands for on this device (null for custom). */
export const currentLevel = (): GraphicsLevel | null => levelOf(useApp.getState().graphicsPreset, deviceSignals())

/** The toggles in effect now (the settings dialog shows these under the preset). */
export function useGraphicsToggles(): GraphicsToggles {
  const preset = useApp((s) => s.graphicsPreset)
  const custom = useApp((s) => s.graphicsCustom)
  const form = formOf(useDeviceClass())
  return useMemo(() => effectiveToggles(preset, custom, deviceSignals(), form), [preset, custom, form])
}

/** The render configuration every scene reads: one place for all graphics settings. */
export function useGraphics(): RenderConfig {
  const toggles = useGraphicsToggles()
  const form = formOf(useDeviceClass())
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  return useMemo(() => renderConfig(toggles, form, dpr), [toggles, form, dpr])
}

/** Session-only graphics state: the "graphics lowered" notice. */
interface GraphicsSession {
  /** The auto downgrade happened and its notice is still up. */
  toast: boolean
  /** It happened this session (only once). */
  downgraded: boolean
  dismissToast: () => void
}

export const useGraphicsSession = create<GraphicsSession>()((set) => ({
  toast: false,
  downgraded: false,
  dismissToast: () => set({ toast: false }),
}))

/**
 * Frames stayed slow in Cân bằng or Đẹp nhất: step the preset down once (kept for next time, so the
 * device starts smooth) and show the notice.
 */
export function autoDowngrade(): void {
  const session = useGraphicsSession.getState()
  if (session.downgraded) return
  const level = currentLevel()
  if (level === null || level === 'battery') return
  useApp.getState().setGraphicsPreset(lowerLevel(level))
  useGraphicsSession.setState({ downgraded: true, toast: true })
}
