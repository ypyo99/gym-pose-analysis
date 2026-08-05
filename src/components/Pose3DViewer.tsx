import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sphere, Line, Html } from '@react-three/drei';
import type { LandmarkList } from '@mediapipe/pose';

function calculateAngle3D(a: any, b: any, c: any): number {
  if (!a || !b || !c) return 0;
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magBA = Math.sqrt(ba.x*ba.x + ba.y*ba.y + ba.z*ba.z);
  const magBC = Math.sqrt(bc.x*bc.x + bc.y*bc.y + bc.z*bc.z);
  if (magBA * magBC === 0) return 0;
  return Math.acos(dot / (magBA * magBC)) * (180 / Math.PI);
}

// MediaPipe POSE_CONNECTIONS (fallback if global is not available)
const POSE_CONNECTIONS: [number, number][] = (window as any).POSE_CONNECTIONS || [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10], 
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], 
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], [11, 23], 
  [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], 
  [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]
];

interface Pose3DViewerProps {
  worldLandmarks: LandmarkList | null;
  onBackgroundClick?: () => void;
  mode?: 'squat' | 'deadlift' | 'turtle' | 'asymmetry' | 'plank';
}

const Pose3DViewer: React.FC<Pose3DViewerProps> = ({ worldLandmarks, onBackgroundClick, mode }) => {
  // Transform landmarks to match Three.js coordinate system
  // MediaPipe: x right, y down, z forward
  // Three.js: x right, y up, z out
  const transformedLandmarks = useMemo(() => {
    if (!worldLandmarks || worldLandmarks.length < 25) return null;

    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let maxY = -Infinity;

    worldLandmarks.forEach((lm: any, i: number) => {
      // Exclude face (0-10), hands (17-22), and feet (29-32) from bounding box
      if (lm.visibility && lm.visibility > 0.5 && i > 10 && (i < 17 || i > 22) && i < 29) {
        if (lm.x < minX) minX = lm.x;
        if (lm.x > maxX) maxX = lm.x;
        if (lm.z < minZ) minZ = lm.z;
        if (lm.z > maxZ) maxZ = lm.z;
        if (lm.y > maxY) maxY = lm.y;
      }
    });

    const cx = minX !== Infinity ? (minX + maxX) / 2 : 0;
    const cz = minZ !== Infinity ? (minZ + maxZ) / 2 : 0;
    const cy = maxY !== -Infinity ? maxY : 0;

    return worldLandmarks.map((lm, index) => {
      // Scale coordinates up a bit for better viewing
      const scale = 2;
      return {
        x: (lm.x - cx) * scale,
        y: -(lm.y - cy) * scale, // Flip Y so head is up
        z: -(lm.z - cz) * scale, // Flip Z so it matches expected depth
        visibility: lm.visibility || 0,
        index
      };
    });
  }, [worldLandmarks]);

  const anglesToRender = useMemo(() => {
    if (!transformedLandmarks || !mode) return [];
    const angles: { pos: [number, number, number]; text: string }[] = [];
    
    const getLm = (index: number) => transformedLandmarks[index];

    if (mode === 'squat') {
      const hip = getLm(24); // Right hip
      const knee = getLm(26); // Right knee
      const ankle = getLm(28); // Right ankle
      if (hip && knee && ankle && hip.visibility > 0.5 && knee.visibility > 0.5 && ankle.visibility > 0.5) {
        const angle = calculateAngle3D(hip, knee, ankle);
        angles.push({ pos: [knee.x, knee.y, knee.z], text: `${Math.round(angle)}°` });
      }
    } else if (mode === 'deadlift') {
      const ear = getLm(8);
      const shoulder = getLm(12);
      const hip = getLm(24);
      const knee = getLm(26);
      if (ear && shoulder && hip && knee) {
        const hipAngle = calculateAngle3D(shoulder, hip, knee);
        const backAngle = calculateAngle3D(ear, shoulder, hip);
        angles.push({ pos: [hip.x, hip.y, hip.z], text: `Hip: ${Math.round(hipAngle)}°` });
        angles.push({ pos: [shoulder.x, shoulder.y, shoulder.z], text: `Back: ${Math.round(backAngle)}°` });
      }
    } else if (mode === 'turtle') {
      const ear = getLm(8);
      const shoulder = getLm(12);
      const hip = getLm(24);
      if (ear && shoulder && hip) {
        const angle = calculateAngle3D(ear, shoulder, hip);
        angles.push({ pos: [shoulder.x, shoulder.y, shoulder.z], text: `Neck: ${Math.round(angle)}°` });
      }
    } else if (mode === 'plank') {
      const shoulder = getLm(12);
      const hip = getLm(24);
      const ankle = getLm(28);
      if (shoulder && hip && ankle) {
        const angle = calculateAngle3D(shoulder, hip, ankle);
        angles.push({ pos: [hip.x, hip.y, hip.z], text: `Core: ${Math.round(angle)}°` });
      }
    }
    
    return angles;
  }, [transformedLandmarks, mode]);

  return (
    <Canvas
      camera={{ position: [0, 1, 5], fov: 50 }}
      className="w-full h-full"
      style={{ background: 'transparent' }}
      onPointerMissed={onBackgroundClick}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 10]} intensity={1.5} />
      
      <OrbitControls 
        enablePan={false}
        enableZoom={true}
        enableRotate={true}
        autoRotate={false}
      />
      
      <group position={[0, -1, 0]}>
        {/* Draw Bones (Lines) */}
        {transformedLandmarks && POSE_CONNECTIONS.map(([startIdx, endIdx], i) => {
          const start = transformedLandmarks[startIdx];
          const end = transformedLandmarks[endIdx];
          
          // Skip drawing if visibility is too low or it's a face/hand/foot landmark
          if (start.visibility < 0.5 || end.visibility < 0.5) return null;
          if (startIdx <= 10 || (startIdx >= 17 && startIdx <= 22) || startIdx >= 29) return null;
          if (endIdx <= 10 || (endIdx >= 17 && endIdx <= 22) || endIdx >= 29) return null;
          
          return (
            <Line
              key={`bone-${i}`}
              points={[
                [start.x, start.y, start.z],
                [end.x, end.y, end.z]
              ]}
              color="#00FF00"
              lineWidth={4}
            />
          );
        })}

        {/* Draw Joints (Spheres) */}
        {transformedLandmarks && transformedLandmarks.map((lm, i) => {
          if (lm.visibility < 0.5) return null;
          if (i <= 10 || (i >= 17 && i <= 22) || i >= 29) return null; // Hide face, hands, feet
          
          return (
            <Sphere
              key={`joint-${i}`}
              args={[0.04, 16, 16]}
              position={[lm.x, lm.y, lm.z]}
            >
              <meshStandardMaterial color="#FF0000" />
            </Sphere>
          );
        })}
        
        {/* Draw Angles using Html */}
        {anglesToRender.map((angle, i) => (
          <Html key={`angle-${i}`} position={angle.pos} center zIndexRange={[100, 0]}>
            <div className="bg-black/70 text-white px-2 py-1 rounded-md text-sm md:text-base font-bold whitespace-nowrap pointer-events-none transform -translate-y-6 md:-translate-y-8 border border-white/30 shadow-lg backdrop-blur-sm">
              {angle.text}
            </div>
          </Html>
        ))}

        {/* Grid Floor to give spatial reference */}
        <gridHelper args={[10, 10, '#ffffff', '#555555']} position={[0, -1, 0]} />
      </group>
    </Canvas>
  );
};

export default Pose3DViewer;
