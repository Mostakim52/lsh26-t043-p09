import { ContactShadows, Environment, Html, Lightformer, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Group } from 'three';

import { hasWebGL } from './CarStage';

function KeyFob() {
  return (
    <group rotation={[0.18, -0.35, 0.08]}>
      <RoundedBox args={[0.62, 1.02, 0.2]} radius={0.07} smoothness={4} castShadow receiveShadow>
        <meshPhysicalMaterial color="#0f1115" metalness={0.35} roughness={0.25} clearcoat={0.9} clearcoatRoughness={0.15} />
      </RoundedBox>
      {/* chrome key ring */}
      <mesh position={[0, 0.64, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.09, 0.024, 12, 24]} />
        <meshStandardMaterial color="#d6dae1" metalness={0.95} roughness={0.12} />
      </mesh>
      {/* secondary loop */}
      <mesh position={[0, 0.58, 0.02]} rotation={[0.2, 0.1, 0]}>
        <torusGeometry args={[0.045, 0.009, 8, 16]} />
        <meshStandardMaterial color="#9aa2ad" metalness={0.9} roughness={0.15} />
      </mesh>
      {/* buttons */}
      <mesh position={[0, 0.16, 0.105]}>
        <circleGeometry args={[0.10, 24]} />
        <meshStandardMaterial color="#1e2430" />
      </mesh>
      <mesh position={[0, -0.11, 0.105]}>
        <circleGeometry args={[0.10, 24]} />
        <meshStandardMaterial color="#1e2430" />
      </mesh>
      <mesh position={[0, -0.36, 0.105]}>
        <circleGeometry args={[0.07, 24]} />
        <meshStandardMaterial color="#1e2430" />
      </mesh>
      {/* button icons */}
      <mesh position={[0, 0.16, 0.108]}>
        <ringGeometry args={[0.05, 0.06, 16]} />
        <meshBasicMaterial color="#8aa0ff" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.11, 0.108]}>
        <ringGeometry args={[0.05, 0.06, 16]} />
        <meshBasicMaterial color="#ff6b6b" transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
      {/* subtle highlight */}
      <mesh position={[0.14, 0.28, 0.09]}>
        <planeGeometry args={[0.18, 0.4]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.05} side={THREE.DoubleSide} />
      </mesh>
      {/* SD engraving hint */}
      <mesh position={[0, -0.36, 0.107]}>
        <planeGeometry args={[0.22, 0.06]} />
        <meshBasicMaterial color="#d6dae1" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function FloatRig({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    g.rotation.y = Math.sin(state.clock.elapsedTime * 0.45) * 0.22;
    g.rotation.x = Math.sin(state.clock.elapsedTime * 0.33) * 0.1;
    g.rotation.z = Math.sin(state.clock.elapsedTime * 0.28) * 0.06;
    g.position.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.08;
  });
  return <group ref={ref}>{children}</group>;
}

export function HandKeyStage({ className }: { className?: string }) {
  const [supported] = useState(hasWebGL);

  if (!supported) {
    return (
      <div className={`handkey-fallback ${className ?? ''}`} aria-hidden="true">
        <div className="handkey-fallback__card">
          <span className="handkey-fallback__icon">🔑</span>
          <span>Workshop key</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`handkey-stage ${className ?? ''}`}>
      <Canvas
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 26, position: [0, 0.15, 3.0] }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[3, 4, 2]} intensity={1.4} castShadow />
        <directionalLight position={[-2, 1, -1]} intensity={0.5} color="#7fb0ff" />
        <pointLight position={[0, 1.5, 1]} intensity={0.6} color="#ffd9b0" />

        <Suspense fallback={<Html center><span style={{ color: '#fff', fontSize: 12 }}>Loading…</span></Html>}>
          <FloatRig>
            <KeyFob />
          </FloatRig>
          <ContactShadows position={[0, -0.9, 0]} opacity={0.45} scale={5.5} blur={2.2} far={2.2} resolution={256} />
          <Environment resolution={128} frames={1}>
            <Lightformer form="rect" intensity={2.4} position={[0, 3, 1]} scale={[6, 2, 1]} color="#ffffff" />
            <Lightformer form="rect" intensity={1.1} position={[-3, 1, 1]} scale={[2, 2, 1]} color="#9fc4ff" />
            <Lightformer form="rect" intensity={1} position={[3, 1, -1]} scale={[2, 2, 1]} color="#ffd9b0" />
          </Environment>
        </Suspense>
      </Canvas>
    </div>
  );
}

export { KeyFob as HandKeyModel };
export { KeyFob as CarKeyModel };
