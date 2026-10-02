import { forwardRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'

/** A picture (an emoji) that always faces the camera and shows through buildings: a marker. */
export const EmojiSprite = forwardRef<THREE.Sprite, { emoji: string; size: number; position?: [number, number, number]; through?: boolean }>(
  function EmojiSprite({ emoji, size, position, through = true }, ref) {
    const texture = useMemo(() => {
      const px = 128
      const canvas = document.createElement('canvas')
      canvas.width = px
      canvas.height = px
      const g = canvas.getContext('2d')
      if (g) {
        g.font = `${px * 0.8}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(emoji, px / 2, px * 0.56)
      }
      const t = new THREE.CanvasTexture(canvas)
      t.colorSpace = THREE.SRGBColorSpace
      return t
    }, [emoji])
    const material = useMemo(() => new THREE.SpriteMaterial({ map: texture, depthTest: !through, transparent: true, toneMapped: false }), [texture, through])
    useEffect(
      () => () => {
        material.dispose()
        texture.dispose()
      },
      [material, texture],
    )
    return <sprite ref={ref} material={material} scale={[size, size, size]} position={position} renderOrder={through ? 12 : 4} />
  },
)
