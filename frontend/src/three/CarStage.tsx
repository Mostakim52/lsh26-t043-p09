import { ContactShadows, Environment, Html, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { Group } from 'three';
import { MathUtils } from 'three';

import type { DueStatus, Vehicle } from '../engine/types';
import { CarModel, zoneAnchor } from './CarModel';

export interface Hotspot {
  zone: string;
  label: string;
  status: DueStatus;
  count: number;
}

const STATUS_COLOUR: Record<DueStatus, string> = {
  overdue: '#ff4d3d',
  dueSoon: '#ffb020',
  fine: '#2fcf8f',
};

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function hasWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext
      && (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    );
  } catch {
    return false;
  }
}

/**
 * Turns the page's scroll position into car rotation (hero) or a gentle float
 * (inspect). In inspect mode the Y spin is left to OrbitControls so the user
 * can drag; the rig only handles the bob and pointer-follow.
 * Reading scrollY inside the frame loop keeps it off React's render path — 60fps
 * without a single component re-render.
 */
function ScrollRig({
  children,
  mode,
  spin,
}: {
  children: React.ReactNode;
  mode: 'hero' | 'inspect';
  spin: number;
}) {
  const group = useRef<Group>(null);
  const reduced = useMemo(prefersReducedMotion, []);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;

    if (mode === 'hero') {
      const scrollable = Math.max(1, document.body.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / scrollable));
      const targetY = spin + progress * Math.PI * 2.4;
      g.rotation.y = reduced ? targetY : MathUtils.damp(g.rotation.y, targetY, 3.5, delta);
    } else if (!reduced) {
      // Inspect: keep a subtle idle spin only when the user is not dragging.
      // OrbitControls owns the main Y rotation; we just let the rig drift slowly.
      const idleY = spin + state.clock.elapsedTime * 0.12;
      // Don't fight the controls — only nudge toward idle when not being dragged.
      // We detect drag by checking if the controls are active via a DOM flag set
      // on the canvas container (OrbitControls sets cursor style).
      const isDragging = document.body.getAttribute('data-orbit-dragging') === '1';
      if (!isDragging) {
        g.rotation.y = MathUtils.damp(g.rotation.y, idleY, 1.2, delta);
      }
    } else {
      g.rotation.y = spin;
    }

    if (!reduced) {
      g.position.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.025;
      // Tilt with pointer only in inspect for a more tactile feel; hero already
      // reacts to scroll for weight.
      g.rotation.z = MathUtils.damp(g.rotation.z, state.pointer.y * 0.035, 2.5, delta);
      g.rotation.x = MathUtils.damp(g.rotation.x, -state.pointer.y * 0.02, 2.5, delta);
    }
  });

  return <group ref={group}>{children}</group>;
}

/** Pulls the camera back and drops it lower as the viewport narrows. */
function ResponsiveCamera({ distance }: { distance: number }) {
  const { camera, size } = useThree();

  useEffect(() => {
    const narrow = size.width < 640;
    const mid = size.width < 1024;
    const d = distance * (narrow ? 1.34 : mid ? 1.15 : 1);
    camera.position.set(d * 0.68, narrow ? 1.9 : 2.3, d * 0.76);
    camera.lookAt(0, 0.62, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, distance]);

  return null;
}

function HotspotMarkers({
  hotspots,
  bodyType,
  onSelect,
}: {
  hotspots: Hotspot[];
  bodyType: Vehicle['bodyType'];
  onSelect?: (zone: string) => void;
}) {
  return (
    <>
      {hotspots.map((spot) => (
        <group key={spot.zone} position={zoneAnchor(spot.zone, bodyType)}>
          <Html center distanceFactor={13} zIndexRange={[20, 0]} transform sprite>
            <button
              type="button"
              className={`hotspot hotspot--${spot.status}`}
              onClick={() => onSelect?.(spot.zone)}
              style={{ ['--spot' as string]: STATUS_COLOUR[spot.status] }}
            >
              <span className="hotspot__dot" aria-hidden="true" />
              <span className="hotspot__label">
                {spot.label}
                <span className="hotspot__count">{spot.count}</span>
              </span>
            </button>
          </Html>
        </group>
      ))}
    </>
  );
}

export function CarStage({
  vehicle,
  mode = 'hero',
  hotspots = [],
  onSelectZone,
  distance = 7.4,
  spin = 0.55,
  className,
}: {
  vehicle: Pick<Vehicle, 'bodyType' | 'colour'>;
  mode?: 'hero' | 'inspect';
  hotspots?: Hotspot[];
  onSelectZone?: (zone: string) => void;
  distance?: number;
  spin?: number;
  className?: string;
}) {
  const [supported] = useState(hasWebGL);

  if (!supported) {
    return (
      <div className={`stage stage--fallback ${className ?? ''}`}>
        <CarSilhouette colour={vehicle.colour} />
        <p className="stage__note">3D view needs WebGL, which this browser has turned off.</p>
      </div>
    );
  }

  return (
    <div className={`stage ${className ?? ''}`}>
      <Canvas
        shadows
        dpr={[1, 1.8]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 32, near: 0.1, far: 60 }}
      >
        <ResponsiveCamera distance={distance} />

        <ambientLight intensity={0.32} />
        <directionalLight
          position={[5, 8, 4]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
        />
        <directionalLight position={[-6, 3, -4]} intensity={0.5} color="#7fb0ff" />

        <Suspense fallback={<Html center><span className="stage__note">Loading 3D…</span></Html>}>
          <ScrollRig mode={mode} spin={spin}>
            <CarModel vehicle={vehicle} />
            {hotspots.length ? (
              <HotspotMarkers
                hotspots={hotspots}
                bodyType={vehicle.bodyType}
                onSelect={onSelectZone}
              />
            ) : null}
          </ScrollRig>

          <ContactShadows
            position={[0, 0, 0]}
            opacity={0.62}
            scale={13}
            blur={2.4}
            far={4}
            resolution={512}
            color="#000000"
          />

          {/* A studio built from light shapes: gives the paint something to reflect
              without downloading an HDRI from anyone's CDN. */}
          <Environment resolution={256} frames={1}>
            <Lightformer
              form="rect"
              intensity={3.4}
              position={[0, 5, 1]}
              scale={[9, 3, 1]}
              rotation={[-Math.PI / 2, 0, 0]}
              color="#ffffff"
            />
            <Lightformer
              form="rect"
              intensity={2.1}
              position={[-5, 1.6, 2]}
              scale={[3, 4, 1]}
              rotation={[0, Math.PI / 2.4, 0]}
              color="#9fc4ff"
            />
            <Lightformer
              form="rect"
              intensity={1.7}
              position={[5, 1.4, -2]}
              scale={[3, 4, 1]}
              rotation={[0, -Math.PI / 2.4, 0]}
              color="#ffd9b0"
            />
            <Lightformer form="circle" intensity={1.2} position={[0, -3, 0]} scale={6} color="#20262f" />
          </Environment>
        </Suspense>

        {/* Inspect mode: manual orbit with damping, zoom clamped, pan disabled. Hero keeps its
            scroll-driven spin without extra controls so the page scroll still owns the rotation. */}
        {mode === 'inspect' ? (
          <OrbitControls
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.6}
            minDistance={distance * 0.72}
            maxDistance={distance * 1.45}
            minPolarAngle={Math.PI * 0.16}
            maxPolarAngle={Math.PI * 0.5}
            autoRotate={false}
            onStart={() => document.body.setAttribute('data-orbit-dragging', '1')}
            onEnd={() => document.body.setAttribute('data-orbit-dragging', '0')}
          />
        ) : null}
      </Canvas>
    </div>
  );
}

/** Flat stand-in for browsers without WebGL, and for the loading state. */
export function CarSilhouette({ colour = '#4b515a' }: { colour?: string }) {
  return (
    <svg viewBox="0 0 220 84" className="silhouette" role="img" aria-label="Car">
      <path
        d="M14 60c-4 0-7-3-7-7v-8c0-5 3-8 8-10l24-7 20-15c4-3 8-4 12-4h44c5 0 9 2 13 5l17 14 30 6c7 2 11 6 11 12v7c0 4-3 7-7 7h-15a19 19 0 0 0-38 0H67a19 19 0 0 0-38 0z"
        fill={colour}
        opacity="0.9"
      />
      <path d="M70 22h34l14 13H62z" fill="#0b0d11" opacity="0.65" />
      <circle cx="48" cy="61" r="13" fill="#15171b" />
      <circle cx="48" cy="61" r="5" fill="#8d959f" />
      <circle cx="167" cy="61" r="13" fill="#15171b" />
      <circle cx="167" cy="61" r="5" fill="#8d959f" />
    </svg>
  );
}
