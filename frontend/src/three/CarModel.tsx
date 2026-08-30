import { useMemo } from 'react';
import * as THREE from 'three';

import type { Vehicle } from '../engine/types';

/**
 * The car is built in code rather than loaded from a .glb: no licence to chase, no
 * megabyte download, no CDN at runtime, and the proportions can be driven from the
 * vehicle record so an SUV in the fleet actually reads as an SUV.
 *
 * Everything is extruded from a side profile drawn in the XY plane and pushed along Z,
 * which is why the wheel arches are part of the outline rather than boolean cutouts.
 */

export interface Proportions {
  halfLength: number;
  width: number;
  sill: number;
  belt: number;
  roof: number;
  archPeak: number;
  wheelRadius: number;
  wheelX: number;
  cabinFront: number;
  cabinRear: number;
  ride: number;
}

const PROPORTIONS: Record<Vehicle['bodyType'], Proportions> = {
  sedan: {
    halfLength: 2.25, width: 1.7, sill: 0.34, belt: 1.05, roof: 1.47,
    archPeak: 0.8, wheelRadius: 0.4, wheelX: 1.45, cabinFront: 1.26, cabinRear: -1.6, ride: 0,
  },
  hatchback: {
    halfLength: 2.05, width: 1.66, sill: 0.34, belt: 1.06, roof: 1.52,
    archPeak: 0.8, wheelRadius: 0.39, wheelX: 1.32, cabinFront: 1.14, cabinRear: -1.74, ride: 0.02,
  },
  suv: {
    halfLength: 2.32, width: 1.82, sill: 0.44, belt: 1.2, roof: 1.72,
    archPeak: 0.94, wheelRadius: 0.47, wheelX: 1.5, cabinFront: 1.3, cabinRear: -1.82, ride: 0.09,
  },
  mpv: {
    halfLength: 2.4, width: 1.78, sill: 0.4, belt: 1.16, roof: 1.82,
    archPeak: 0.88, wheelRadius: 0.43, wheelX: 1.54, cabinFront: 1.4, cabinRear: -2.0, ride: 0.05,
  },
};

/** Side silhouette of the lower body, wheel arches included. */
function buildBodyShape(p: Proportions): THREE.Shape {
  const { halfLength: L, sill, belt, archPeak: arch, wheelX: wx, wheelRadius: r } = p;
  const archHalf = r + 0.12;
  const s = new THREE.Shape();

  s.moveTo(-L + 0.07, 0.52);
  s.lineTo(-L, 0.82);
  s.quadraticCurveTo(-L + 0.05, belt - 0.02, -L + 0.32, belt);
  s.lineTo(-0.9, belt + 0.02);
  s.lineTo(0.7, belt + 0.01);
  s.quadraticCurveTo(L - 0.24, belt - 0.06, L - 0.05, 0.78);
  s.lineTo(L, 0.54);
  s.quadraticCurveTo(L - 0.03, sill + 0.04, L - 0.24, sill);

  // front wheel arch
  s.lineTo(wx + archHalf, sill);
  s.quadraticCurveTo(wx + archHalf - 0.04, arch, wx, arch + 0.02);
  s.quadraticCurveTo(wx - archHalf + 0.04, arch, wx - archHalf, sill);

  // sill between the axles
  s.lineTo(-wx + archHalf, sill);

  // rear wheel arch
  s.quadraticCurveTo(-wx + archHalf - 0.04, arch, -wx, arch + 0.02);
  s.quadraticCurveTo(-wx - archHalf + 0.04, arch, -wx - archHalf, sill);

  s.lineTo(-L + 0.24, sill);
  s.quadraticCurveTo(-L + 0.04, sill + 0.04, -L + 0.07, 0.52);
  return s;
}

/** The greenhouse: rear screen, roof, windscreen. */
function buildCabinShape(p: Proportions): THREE.Shape {
  const { belt, roof, cabinFront: f, cabinRear: b } = p;
  const s = new THREE.Shape();
  s.moveTo(b, belt);
  s.quadraticCurveTo(b + 0.3, roof - 0.02, b + 0.82, roof);
  s.lineTo(f - 0.84, roof);
  s.quadraticCurveTo(f - 0.32, roof - 0.05, f, belt);
  s.closePath();
  return s;
}

function extrude(shape: THREE.Shape, depth: number, bevel: number): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 18,
  });
  geo.translate(0, 0, -depth / 2 + bevel);
  geo.computeVertexNormals();
  return geo;
}

function Wheel({ radius, width }: { radius: number; width: number }) {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[radius, radius, width, 32]} />
        <meshStandardMaterial color="#15171b" roughness={0.92} metalness={0.05} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[0, (side * width) / 2 + side * 0.001, 0]}>
          <mesh>
            <cylinderGeometry args={[radius * 0.64, radius * 0.64, 0.02, 28]} />
            <meshStandardMaterial color="#9aa2ad" roughness={0.3} metalness={0.92} />
          </mesh>
          <mesh position={[0, side * 0.012, 0]}>
            <cylinderGeometry args={[radius * 0.19, radius * 0.19, 0.03, 18]} />
            <meshStandardMaterial color="#5d646e" roughness={0.35} metalness={0.9} />
          </mesh>
          {Array.from({ length: 5 }, (_, i) => (
            <mesh
              key={i}
              position={[0, side * 0.008, 0]}
              rotation={[0, (i * Math.PI * 2) / 5, 0]}
            >
              <boxGeometry args={[radius * 0.11, 0.02, radius * 1.1]} />
              <meshStandardMaterial color="#8d959f" roughness={0.32} metalness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function CarModel({
  vehicle,
  tint,
}: {
  vehicle: Pick<Vehicle, 'bodyType' | 'colour'>;
  /** Overrides the paint colour, used when a status should read through the model. */
  tint?: string;
}) {
  const p = PROPORTIONS[vehicle.bodyType] ?? PROPORTIONS.sedan;
  const paint = tint ?? vehicle.colour;

  const { bodyGeo, cabinGeo, floorGeo } = useMemo(() => {
    const body = extrude(buildBodyShape(p), p.width, 0.07);
    const cabin = extrude(buildCabinShape(p), p.width - 0.2, 0.05);
    const floor = new THREE.BoxGeometry(p.wheelX * 2 - 0.3, 0.06, p.width - 0.28);
    return { bodyGeo: body, cabinGeo: cabin, floorGeo: floor };
  }, [p]);

  const lightBar = p.halfLength - 0.06;

  return (
    <group position={[0, p.ride, 0]} dispose={null}>
      <mesh geometry={bodyGeo} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={paint}
          metalness={0.62}
          roughness={0.26}
          clearcoat={0.85}
          clearcoatRoughness={0.14}
          envMapIntensity={1.15}
        />
      </mesh>

      <mesh geometry={cabinGeo} castShadow>
        <meshPhysicalMaterial
          color="#0c1016"
          metalness={0.35}
          roughness={0.07}
          transmission={0.25}
          thickness={0.4}
          transparent
          opacity={0.94}
          envMapIntensity={1.5}
        />
      </mesh>

      <mesh geometry={floorGeo} position={[0, p.sill - 0.02, 0]}>
        <meshStandardMaterial color="#0a0c10" roughness={0.95} />
      </mesh>

      {/* headlights and tail lights */}
      {[-1, 1].map((side) => (
        <mesh key={`h${side}`} position={[lightBar, p.belt - 0.28, side * (p.width / 2 - 0.3)]}>
          <boxGeometry args={[0.07, 0.13, 0.42]} />
          <meshStandardMaterial
            color="#eaf2ff"
            emissive="#cfe2ff"
            emissiveIntensity={1.6}
            roughness={0.2}
          />
        </mesh>
      ))}
      <mesh position={[-lightBar, p.belt - 0.22, 0]}>
        <boxGeometry args={[0.06, 0.09, p.width - 0.44]} />
        <meshStandardMaterial color="#8e1b17" emissive="#ff3b2e" emissiveIntensity={1.1} roughness={0.3} />
      </mesh>

      {/* mirrors */}
      {[-1, 1].map((side) => (
        <mesh
          key={`m${side}`}
          position={[p.cabinFront - 0.18, p.belt + 0.06, side * (p.width / 2 + 0.04)]}
          rotation={[0, 0, -0.2]}
        >
          <boxGeometry args={[0.2, 0.08, 0.14]} />
          <meshStandardMaterial color="#14171c" roughness={0.5} metalness={0.4} />
        </mesh>
      ))}

      {/* wheels */}
      {[
        [p.wheelX, p.width / 2 - 0.06],
        [p.wheelX, -(p.width / 2 - 0.06)],
        [-p.wheelX, p.width / 2 - 0.06],
        [-p.wheelX, -(p.width / 2 - 0.06)],
      ].map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, p.wheelRadius, z]}>
          <Wheel radius={p.wheelRadius} width={0.28} />
        </group>
      ))}
    </group>
  );
}

/** Where a service item's hotspot sits on the model, in car-local coordinates. */
export function zoneAnchor(
  zone: string,
  bodyType: Vehicle['bodyType'],
): [number, number, number] {
  const p = PROPORTIONS[bodyType] ?? PROPORTIONS.sedan;
  switch (zone) {
    case 'engine':
      return [p.halfLength - 0.7, p.belt + 0.12 + p.ride, 0];
    case 'frontAxle':
      return [p.wheelX, p.wheelRadius + 0.1 + p.ride, p.width / 2 + 0.16];
    case 'rearAxle':
      return [-p.wheelX, p.wheelRadius + 0.1 + p.ride, p.width / 2 + 0.16];
    case 'cabin':
      return [0, p.roof + 0.1 + p.ride, 0];
    case 'underbody':
      return [-0.2, p.sill - 0.14 + p.ride, p.width / 2 - 0.2];
    default:
      return [-p.halfLength + 0.5, p.belt + 0.02 + p.ride, p.width / 2 + 0.1];
  }
}

export const CAR_ZONES = ['engine', 'frontAxle', 'rearAxle', 'cabin', 'body', 'underbody'] as const;
