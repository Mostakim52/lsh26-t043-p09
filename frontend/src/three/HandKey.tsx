import { ContactShadows, Environment, Html, Lightformer, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Group } from 'three';

import { hasWebGL } from './CarStage';

function Finger({ length, radius, pos, rot }: { length: number; radius: number; pos: [number, number, number]; rot?: [number, number, number] }) {
  return (
    <group position={pos} rotation={rot}>
      <mesh castShadow>
        <capsuleGeometry args={[radius, length, 8, 16]} />
        <meshStandardMaterial color="#d9b8a0" roughness={0.55} metalness={0.02} />
      </mesh>
    </group>
  );
}

function KeyFob() {
  return (
    <group position={[0.42, -0.05, 0.05]} rotation={[0.35, -0.4, -0.18]}>
      <RoundedBox args={[0.55, 0.92, 0.18]} radius={0.06} smoothness={4} castShadow receiveShadow>
        <meshPhysicalMaterial color="#0f1115" metalness={0.35} roughness={0.25} clearcoat={0.9} clearcoatRoughness={0.15} />
      </RoundedBox>
      <mesh position={[0, 0.58, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.08, 0.022, 12, 24]} />
        <meshStandardMaterial color="#d6dae1" metalness={0.95} roughness={0.12} />
      </mesh>
      <mesh position={[0, 0.14, 0.095]}>
        <circleGeometry args={[0.09, 24]} />
        <meshStandardMaterial color="#1e2430" />
      </mesh>
      <mesh position={[0, -0.1, 0.095]}>
        <circleGeometry args={[0.09, 24]} />
        <meshStandardMaterial color="#1e2430" />
      </mesh>
      <mesh position={[0, 0.14, 0.097]}>
        <ringGeometry args={[0.045, 0.055, 16]} />
        <meshBasicMaterial color="#8aa0ff" transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function HandWithKey() {
  const palm = useMemo(() => new THREE.BoxGeometry(0.62, 0.72, 0.24), []);
  return (
    <group>
      <mesh geometry={palm} castShadow receiveShadow position={[0, 0, 0]} rotation={[0.2, -0.15, 0]}>
        <meshStandardMaterial color="#d9b8a0" roughness={0.62} />
      </mesh>
      <Finger length={0.42} radius={0.085} pos={[0.28, 0.32, 0.08]} rot={[0.55, 0, -0.25]} />
      <Finger length={0.46} radius={0.088} pos={[0.09, 0.38, 0.1]} rot={[0.52, 0, -0.08]} />
      <Finger length={0.44} radius={0.084} pos={[-0.11, 0.36, 0.08]} rot={[0.5, 0, 0.06]} />
      <Finger length={0.34} radius={0.076} pos={[-0.29, 0.28, 0.05]} rot={[0.45, 0, 0.18]} />
      <group position={[-0.22, -0.06, 0.18]} rotation={[0.2, 0.6, -0.25]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.095, 0.36, 8, 16]} />
          <meshStandardMaterial color="#d9b8a0" roughness={0.55} />
        </mesh>
      </group>
      <mesh position={[0, -0.52, -0.02]} castShadow>
        <cylinderGeometry args={[0.19, 0.22, 0.32, 16]} />
        <meshStandardMaterial color="#c9a994" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.72, -0.02]}>
        <cylinderGeometry args={[0.23, 0.23, 0.08, 16]} />
        <meshStandardMaterial color="#0f1217" roughness={0.7} />
      </mesh>
      <KeyFob />
      <mesh position={[0.42, 0.52, 0.02]} rotation={[0, 0, 0.3]}>
        <torusGeometry args={[0.04, 0.008, 8, 16]} />
        <meshStandardMaterial color="#9aa2ad" metalness={0.9} roughness={0.15} />
      </mesh>
    </group>
  );
}

function FloatRig({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    g.rotation.y = Math.sin(state.clock.elapsedTime * 0.45) * 0.18;
    g.rotation.x = Math.sin(state.clock.elapsedTime * 0.33) * 0.08;
    g.position.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.06;
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
        camera={{ fov: 28, position: [0, 0.3, 3.2] }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 4, 2]} intensity={1.4} castShadow />
        <directionalLight position={[-2, 1, -1]} intensity={0.4} color="#7fb0ff" />

        <Suspense fallback={<Html center><span style={{ color: '#fff', fontSize: 12 }}>Loading…</span></Html>}>
          <FloatRig>
            <HandWithKey />
          </FloatRig>
          <ContactShadows position={[0, -0.95, 0]} opacity={0.5} scale={6} blur={2} far={2} resolution={256} />
          <Environment resolution={128} frames={1}>
            <Lightformer form="rect" intensity={2.2} position={[0, 3, 1]} scale={[6, 2, 1]} color="#ffffff" />
            <Lightformer form="rect" intensity={1} position={[-3, 1, 1]} scale={[2, 2, 1]} color="#9fc4ff" />
            <Lightformer form="rect" intensity={0.9} position={[3, 1, -1]} scale={[2, 2, 1]} color="#ffd9b0" />
          </Environment>
        </Suspense>
      </Canvas>
    </div>
  );
}

export { HandWithKey as HandKeyModel };
