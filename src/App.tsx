import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { platesToWorld, PLATES_PER_BRICK } from './core/units'

export default function App() {
  const h = platesToWorld(PLATES_PER_BRICK)
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [8, 8, 8], fov: 45 }}>
      <color attach="background" args={['#87ceeb']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[4, h, 2]} />
        <meshStandardMaterial color="#e3000b" roughness={0.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[32, 32]} />
        <meshStandardMaterial color="#4caf50" />
      </mesh>
      <OrbitControls makeDefault />
    </Canvas>
  )
}
