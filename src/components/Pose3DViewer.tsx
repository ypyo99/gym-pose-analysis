import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sphere, Line } from '@react-three/drei';
import type { LandmarkList } from '@mediapipe/pose';

// MediaPipe POSE_CONNECTIONS (fallback if global is not available)
const POSE_CONNECTIONS = (window as any).POSE_CONNECTIONS || [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10], 
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], 
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], [11, 23], 
  [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], 
  [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]
];

interface Pose3DViewerProps {
  worldLandmarks: LandmarkList | null;
}

const Pose3DViewer: React.FC<Pose3DViewerProps> = ({ worldLandmarks }) => {
  // Transform landmarks to match Three.js coordinate system
  // MediaPipe: x right, y down, z forward
  // Three.js: x right, y up, z out
  const transformedLandmarks = useMemo(() => {
    if (!worldLandmarks) return null;
    return worldLandmarks.map((lm, index) => {
      // Scale coordinates up a bit for better viewing
      const scale = 2;
      return {
        x: lm.x * scale,
        y: -lm.y * scale, // Flip Y so head is up
        z: -lm.z * scale, // Flip Z so it matches expected depth
        visibility: lm.visibility || 0,
        index
      };
    });
  }, [worldLandmarks]);

  return (
    <Canvas
      camera={{ position: [0, 1, 5], fov: 50 }}
      className="w-full h-full"
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 10]} intensity={1.5} />
      
      <OrbitControls 
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        autoRotate={false}
      />
      
      <group position={[0, -1, 0]}>
        {/* Draw Bones (Lines) */}
        {transformedLandmarks && POSE_CONNECTIONS.map(([startIdx, endIdx], i) => {
          const start = transformedLandmarks[startIdx];
          const end = transformedLandmarks[endIdx];
          
          // Skip drawing if visibility is too low
          if (start.visibility < 0.5 || end.visibility < 0.5) return null;
          
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
        
        {/* Grid Floor to give spatial reference */}
        <gridHelper args={[10, 10, '#ffffff', '#555555']} position={[0, -1, 0]} />
      </group>
    </Canvas>
  );
};

export default Pose3DViewer;
