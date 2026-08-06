import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sphere, Line, Text, Billboard } from '@react-three/drei';
import type { LandmarkList } from '@mediapipe/pose';


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
  poseLandmarksData?: { landmarks: any; width: number; height: number } | null;
  onBackgroundClick?: () => void;
  mode?: 'squat' | 'deadlift' | 'turtle' | 'asymmetry' | 'plank';
}

const Pose3DViewer: React.FC<Pose3DViewerProps> = ({ worldLandmarks, poseLandmarksData, onBackgroundClick, mode }) => {
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
    if (!transformedLandmarks || !mode || !poseLandmarksData) return [];
    const angles: { pos: [number, number, number]; text: string }[] = [];
    
    const getLm3D = (index: number) => transformedLandmarks[index];
    const getLm2D = (index: number) => poseLandmarksData.landmarks[index];
    const { width, height } = poseLandmarksData;

    // Helper to calculate exact 2D angle matching PoseTracker's logic
    const calcAngle = (a2D: any, b2D: any, c2D: any) => {
      const a = { x: a2D.x * width, y: a2D.y * height };
      const b = { x: b2D.x * width, y: b2D.y * height };
      const c = { x: c2D.x * width, y: c2D.y * height };
      const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
      let angle = Math.abs((radians * 180.0) / Math.PI);
      if (angle > 180.0) angle = 360.0 - angle;
      return angle;
    };

    if (mode === 'squat') {
      const hip = getLm2D(24);
      const knee = getLm2D(26);
      const ankle = getLm2D(28);
      const knee3D = getLm3D(26);
      if (hip && knee && ankle && knee3D && hip.visibility > 0.5 && knee.visibility > 0.5 && ankle.visibility > 0.5) {
        const angle = calcAngle(hip, knee, ankle);
        angles.push({ pos: [knee3D.x, knee3D.y, knee3D.z], text: `${Math.round(angle)}°` });
      }
    } else if (mode === 'deadlift') {
      const ear = getLm2D(8);
      const shoulder = getLm2D(12);
      const hip = getLm2D(24);
      const knee = getLm2D(26);
      const hip3D = getLm3D(24);
      const shoulder3D = getLm3D(12);
      if (ear && shoulder && hip && knee && hip3D && shoulder3D) {
        const hipAngle = calcAngle(shoulder, hip, knee);
        const backAngle = calcAngle(ear, shoulder, hip);
        angles.push({ pos: [hip3D.x, hip3D.y, hip3D.z], text: `Hip: ${Math.round(hipAngle)}°` });
        angles.push({ pos: [shoulder3D.x, shoulder3D.y, shoulder3D.z], text: `Back: ${Math.round(backAngle)}°` });
      }
    } else if (mode === 'turtle') {
      const ear = getLm2D(8);
      const shoulder = getLm2D(12);
      const shoulder3D = getLm3D(12);
      if (ear && shoulder && shoulder3D) {
        const dx = Math.abs((ear.x * width) - (shoulder.x * width));
        const dy = Math.abs((ear.y * height) - (shoulder.y * height));
        const angle = Math.atan2(dx, dy) * (180 / Math.PI);
        angles.push({ pos: [shoulder3D.x, shoulder3D.y, shoulder3D.z], text: `Neck: ${Math.round(angle)}°` });
      }
    } else if (mode === 'plank') {
      const shoulder = getLm2D(12);
      const hip = getLm2D(24);
      const ankle = getLm2D(28);
      const hip3D = getLm3D(24);
      if (shoulder && hip && ankle && hip3D) {
        const angle = calcAngle(shoulder, hip, ankle);
        angles.push({ pos: [hip3D.x, hip3D.y, hip3D.z], text: `Core: ${Math.round(angle)}°` });
      }
    } else if (mode === 'asymmetry') {
      const ls = getLm2D(11);
      const rs = getLm2D(12);
      const lh = getLm2D(23);
      const rh = getLm2D(24);
      const rs3D = getLm3D(12);
      const rh3D = getLm3D(24);
      if (ls && rs && lh && rh && rs3D && rh3D) {
        const lsP = { x: ls.x * width, y: ls.y * height };
        const rsP = { x: rs.x * width, y: rs.y * height };
        const lhP = { x: lh.x * width, y: lh.y * height };
        const rhP = { x: rh.x * width, y: rh.y * height };
        const shoulderDiff = lsP.y - rsP.y;
        const hipDiff = lhP.y - rhP.y;
        const shoulderAngle = Math.atan2(Math.abs(shoulderDiff), Math.abs(lsP.x - rsP.x)) * (180 / Math.PI);
        const hipAngle = Math.atan2(Math.abs(hipDiff), Math.abs(lhP.x - rhP.x)) * (180 / Math.PI);
        angles.push({ pos: [rs3D.x, rs3D.y, rs3D.z], text: `Shoulder: ${shoulderAngle.toFixed(1)}°` });
        angles.push({ pos: [rh3D.x, rh3D.y, rh3D.z], text: `Pelvis: ${hipAngle.toFixed(1)}°` });
      }
    }
    
    return angles;
  }, [transformedLandmarks, mode, poseLandmarksData]);

  return (
    <Canvas
      camera={{ position: [0, 1, 5], fov: 50 }}
      className="w-full h-full pose-3d-canvas"
      style={{ background: 'transparent' }}
      onPointerMissed={onBackgroundClick}
      gl={{ preserveDrawingBuffer: true }}
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
        
        {/* Draw Angles using WebGL Text so they appear in screenshots */}
        {anglesToRender.map((angle, i) => (
          <Billboard key={`angle-${i}`} position={[angle.pos[0] + 0.3, angle.pos[1], angle.pos[2]]}>
            <Text
              fontSize={0.25}
              color="white"
              outlineWidth={0.04}
              outlineColor="black"
              anchorX="left"
              anchorY="middle"
            >
              {angle.text}
            </Text>
          </Billboard>
        ))}

        {/* Grid Floor to give spatial reference */}
        <gridHelper args={[10, 10, '#ffffff', '#555555']} position={[0, -1, 0]} />
      </group>
    </Canvas>
  );
};

export default Pose3DViewer;
