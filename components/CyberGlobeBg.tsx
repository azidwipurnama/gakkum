"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

export default function CyberGlobeBg() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Setup Scene & Kamera (Near Clipping Plane & Z-Position Diatur Presisi)
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1, // Near plane diperkecil agar tidak memotong tengah bola
      2000
    );

    // Mundurkan kamera jauh ke belakang agar 1 bola utuh muat di tengah
    camera.position.set(0, 0, 350);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Bersihkan container sebelum append
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    globeGroupRef.current = globeGroup;
    scene.add(globeGroup);

    // Radius Bola Dikecilkan Pas (Radius 50)
    const radius = 50;

    // 2. Dots Globe Sphere (Titik Cyan, Orange, Slate)
    const count = 3000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const colorCyan = new THREE.Color("#00f3ff");
    const colorOrange = new THREE.Color("#ff5500");
    const colorSlate = new THREE.Color("#334155");

    for (let i = 0; i < count; i++) {
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;

      positions[i * 3] = radius * Math.cos(theta) * Math.sin(phi);
      positions[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      const rand = Math.random();
      const col = rand > 0.85 ? colorCyan : rand > 0.7 ? colorOrange : colorSlate;
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const pointsMat = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });
    globeGroup.add(new THREE.Points(geometry, pointsMat));

    // 3. Cyber Glowing Tube Arcs (Garis Busur Lengkung Neon)
    const createArc = (colorHex: string) => {
      const p1 = new THREE.Vector3().setFromSphericalCoords(
        radius,
        Math.random() * Math.PI,
        Math.random() * Math.PI * 2
      );
      const p2 = new THREE.Vector3().setFromSphericalCoords(
        radius,
        Math.random() * Math.PI,
        Math.random() * Math.PI * 2
      );

      const mid = p1.clone().add(p2).multiplyScalar(0.5);
      mid.normalize().multiplyScalar(radius * 1.35);

      const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
      const tubeGeo = new THREE.TubeGeometry(curve, 30, 0.7, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex),
        transparent: true,
        opacity: 0.9,
      });

      return new THREE.Mesh(tubeGeo, tubeMat);
    };

    for (let i = 0; i < 10; i++) {
      const color = i % 2 === 0 ? "#00f3ff" : "#ff5500";
      globeGroup.add(createArc(color));
    }

    // 4. Rotasi HANYA Saat Scroll
    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      const delta = window.scrollY - lastScrollY;
      if (globeGroupRef.current) {
        globeGroupRef.current.rotation.y += delta * 0.003;
        globeGroupRef.current.rotation.x += delta * 0.001;
      }
      lastScrollY = window.scrollY;
    };
    window.addEventListener("scroll", handleScroll);

    // Render Loop
    let animId: number;
    const animate = () => {
      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    />
  );
}
