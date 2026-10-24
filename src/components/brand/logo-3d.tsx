"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * 3D AEGIS logo for the sign-in / splash screen only (lazy loaded).
 * Extruded shield + embossed "A" + a thin orbit ring with a bead.
 * Reduced motion → slow orbit only.
 */

const BLUE = "#3E6BE0";
const SILVER = "#E9EDF3";
const RING = "#AEB8C8";

function shieldShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 1.55);
  s.bezierCurveTo(0.55, 1.32, 0.95, 1.3, 1.25, 1.28);
  s.bezierCurveTo(1.28, 0.2, 1.0, -0.85, 0, -1.55);
  s.bezierCurveTo(-1.0, -0.85, -1.28, 0.2, -1.25, 1.28);
  s.bezierCurveTo(-0.95, 1.3, -0.55, 1.32, 0, 1.55);
  return s;
}

function letterA() {
  const s = new THREE.Shape();
  s.moveTo(-0.62, -0.72);
  s.lineTo(-0.16, 0.78);
  s.lineTo(0.16, 0.78);
  s.lineTo(0.62, -0.72);
  s.lineTo(0.34, -0.72);
  s.lineTo(0.22, -0.32);
  s.lineTo(-0.22, -0.32);
  s.lineTo(-0.34, -0.72);
  s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.12, -0.1);
  hole.lineTo(0, 0.34);
  hole.lineTo(0.12, -0.1);
  hole.closePath();
  s.holes.push(hole);
  return s;
}

function Mark({ calm }: { calm: boolean }) {
  const group = useRef<THREE.Group>(null);
  const orbit = useRef<THREE.Group>(null);

  const shieldGeo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shieldShape(), {
      depth: 0.42, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.12, bevelSegments: 10, curveSegments: 48,
    });
    g.center();
    return g;
  }, []);
  const aGeo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(letterA(), {
      depth: 0.18, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.04, bevelSegments: 6,
    });
    g.center();
    return g;
  }, []);

  // Reduced motion: slower orbit, no sway (still alive, never jarring)
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (orbit.current) orbit.current.rotation.z = t * (calm ? 0.5 : 0.9);
    if (group.current) group.current.rotation.y = Math.sin(t * (calm ? 0.35 : 0.6)) * (calm ? 0.22 : 0.32);
  });

  return (
    <group ref={group}>
      <mesh geometry={shieldGeo}>
        <meshStandardMaterial color={BLUE} metalness={0.45} roughness={0.3} />
      </mesh>
      <mesh geometry={aGeo} position={[0, 0, 0.42]} scale={[1.15, 1.15, 1]}>
        <meshStandardMaterial color={SILVER} metalness={0.7} roughness={0.18} />
      </mesh>
      <group rotation={[1.2, -0.35, 0]}>
        <group ref={orbit}>
          <mesh>
            <torusGeometry args={[2.25, 0.07, 32, 200]} />
            <meshStandardMaterial color={RING} metalness={0.85} roughness={0.2} />
          </mesh>
          <mesh position={[2.25, 0, 0]}>
            <sphereGeometry args={[0.2, 32, 32]} />
            <meshStandardMaterial color={BLUE} metalness={0.4} roughness={0.25} />
          </mesh>
          <mesh position={[-2.25, 0, 0]}>
            <sphereGeometry args={[0.12, 32, 32]} />
            <meshStandardMaterial color={SILVER} metalness={0.7} roughness={0.2} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export default function Logo3D({ className }: { className?: string }) {
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div className={className} aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        frameloop="always"
        camera={{ position: [0, 0.2, 8.2], fov: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      >
        <hemisphereLight args={["#f2f6ff", "#10141c", 0.85]} />
        <directionalLight position={[3, 5, 6]} intensity={1.2} />
        <directionalLight position={[-5, 1, -3]} intensity={0.6} color="#9cc0ff" />
        <Mark calm={reduce} />
      </Canvas>
    </div>
  );
}
